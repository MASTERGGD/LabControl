from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from database import get_db
from models.departamento import Departamento
from models.usuario import Usuario, RolUsuario
from models.password_reset import PasswordResetToken, utcnow_naive
from dependencies import get_current_user, crear_access_token, verificar_password, hashear_password
from services.auditoria import registrar, Accion, Recurso
from services.active_sessions import end_session, list_user_sessions, register_session
from services.rate_limit import clear_login_failures, ensure_login_not_locked, register_login_failure
from services.user_permissions import permisos_efectivos
from services.email import enviar_recuperacion_password
from services.password_policy import password_policy_error
from services.user_roles import rol_principal, roles_disponibles
import hashlib
import datetime
import os
import secrets

def _token_expire_minutes() -> int:
    """Duracion del access token. ACCESS_TOKEN_EXPIRE_MINUTES tiene prioridad."""
    if os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"):
        return int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
    return int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "8")) * 60

router = APIRouter(prefix="/auth", tags=["Autenticacion"])


# --- Schemas ------------------------------------------------------------------

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: dict


class UsuarioResponse(BaseModel):
    id: int
    nombre: str
    email: str
    rol: str
    rol_principal: str
    roles_disponibles: list[str] = Field(default_factory=list)
    laboratorio_id: int | None
    departamento_id: int | None = None
    departamento_nombre: str | None = None
    departamento_clave: str | None = None
    permisos: list[str] = []
    activo: bool
    acceso_consultorio: bool = False
    debe_cambiar_password: bool = False

    model_config = ConfigDict(from_attributes=True)


class SessionHeartbeatIn(BaseModel):
    session_id: str
    path: str | None = None


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(..., min_length=32, max_length=256)
    password: str = Field(..., min_length=10, max_length=128)

class CambiarFuncionIn(BaseModel):
    rol: RolUsuario


def _reset_minutes() -> int:
    try:
        return max(5, min(120, int(os.getenv("PASSWORD_RESET_EXPIRE_MINUTES", "30"))))
    except ValueError:
        return 30


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _institutional_email(email: str) -> bool:
    domain = os.getenv("INSTITUTIONAL_EMAIL_DOMAIN", "utecan.edu.mx").strip().lower()
    return email.strip().lower().endswith("@" + domain)


def _active_reset(db: Session, token: str) -> PasswordResetToken | None:
    return db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == _token_hash(token),
        PasswordResetToken.usado_en.is_(None),
        PasswordResetToken.expira_en > utcnow_naive(),
    ).first()


def _serializar_usuario(usuario: Usuario, db: Session) -> dict:
    dep = None
    if usuario.departamento_id:
        dep = db.query(Departamento).filter(Departamento.id == usuario.departamento_id).first()
    return {
        "id": usuario.id,
        "nombre": usuario.nombre,
        "email": usuario.email,
        "rol": usuario.rol.value,
        "rol_principal": rol_principal(usuario).value,
        "roles_disponibles": [rol.value for rol in roles_disponibles(usuario)],
        "laboratorio_id": usuario.laboratorio_id,
        "departamento_id": usuario.departamento_id,
        "departamento_nombre": dep.nombre if dep else None,
        "departamento_clave": dep.clave if dep else None,
        "permisos": permisos_efectivos(db, usuario),
        "activo": usuario.activo,
        "acceso_consultorio": bool(usuario.acceso_consultorio),
        "debe_cambiar_password": bool(getattr(usuario, "debe_cambiar_password", False)),
    }


# --- Endpoints ----------------------------------------------------------------

@router.post("/login", response_model=TokenResponse, summary="Iniciar sesion")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Autentica al usuario con email y contrasena.
    Vigencia configurada con ACCESS_TOKEN_EXPIRE_MINUTES (por defecto 480).
    """
    ensure_login_not_locked(request, form_data.username)

    usuario = db.query(Usuario).filter(
        Usuario.email == form_data.username
    ).first()

    if not usuario or not verificar_password(form_data.password, usuario.password_hash):
        register_login_failure(request, form_data.username)
        registrar(
            db, accion=Accion.LOGIN_FALLIDO, recurso=Recurso.SISTEMA,
            detalle={"email_intentado": form_data.username},
            request=request, exito=False,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contrasena incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not usuario.activo:
        register_login_failure(request, form_data.username)
        registrar(
            db, accion=Accion.LOGIN_FALLIDO, recurso=Recurso.SISTEMA,
            usuario=usuario, detalle={"razon": "cuenta_desactivada"},
            request=request, exito=False,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta cuenta esta desactivada. Contacta al administrador del sistema.",
        )

    token_data = {
        "sub": str(usuario.id),
        "email": usuario.email,
        "rol": usuario.rol.value,
        "rol_activo": usuario.rol.value,
        "lab_id": usuario.laboratorio_id,
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=_token_expire_minutes()),
    }
    token = crear_access_token(token_data)
    clear_login_failures(request, form_data.username)

    registrar(db, accion=Accion.LOGIN_OK, recurso=Recurso.SISTEMA,
              usuario=usuario, request=request)

    return {
        "access_token": token,
        "token_type": "bearer",
        "usuario": _serializar_usuario(usuario, db),
    }


@router.post("/cambiar-funcion", response_model=TokenResponse, summary="Cambiar la función activa de la sesión")
def cambiar_funcion(
    data: CambiarFuncionIn,
    request: Request,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    disponibles = roles_disponibles(current_user)
    if data.rol not in disponibles:
        raise HTTPException(status_code=403, detail="Esa función no está asignada a tu cuenta")
    principal = rol_principal(current_user)
    current_user._rol_principal = principal
    current_user._roles_disponibles = disponibles
    from sqlalchemy.orm.attributes import set_committed_value
    set_committed_value(current_user, "rol", data.rol)
    token = crear_access_token({
        "sub": str(current_user.id),
        "email": current_user.email,
        "rol": data.rol.value,
        "rol_activo": data.rol.value,
        "lab_id": current_user.laboratorio_id,
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=_token_expire_minutes()),
    })
    usuario_serializado = _serializar_usuario(current_user, db)
    registrar(
        db, accion=Accion.CAMBIAR_FUNCION, recurso=Recurso.SISTEMA,
        usuario=current_user,
        detalle={"funcion_anterior": principal.value, "funcion_nueva": data.rol.value},
        request=request,
    )
    return {"access_token": token, "token_type": "bearer", "usuario": usuario_serializado}


@router.post("/password/forgot", summary="Solicitar recuperación de contraseña")
def forgot_password(data: ForgotPasswordIn, request: Request, db: Session = Depends(get_db)):
    """Siempre responde igual para no revelar qué correos tienen una cuenta."""
    generic = {
        "mensaje": "Si el correo pertenece a una cuenta activa, recibirás un enlace temporal en unos minutos."
    }
    email = str(data.email).strip().lower()
    if not _institutional_email(email):
        return generic

    usuario = db.query(Usuario).filter(func.lower(Usuario.email) == email, Usuario.activo.is_(True)).first()
    if not usuario:
        registrar(
            db, accion=Accion.RECUPERACION_SOLICITADA, recurso=Recurso.SISTEMA,
            detalle={"cuenta_encontrada": False}, request=request, exito=False,
        )
        return generic

    now = utcnow_naive()
    db.query(PasswordResetToken).filter(
        PasswordResetToken.usuario_id == usuario.id,
        PasswordResetToken.usado_en.is_(None),
    ).update({PasswordResetToken.usado_en: now}, synchronize_session=False)

    raw_token = secrets.token_urlsafe(48)
    minutes = _reset_minutes()
    reset = PasswordResetToken(
        usuario_id=usuario.id,
        token_hash=_token_hash(raw_token),
        expira_en=now + datetime.timedelta(minutes=minutes),
    )
    db.add(reset)
    db.commit()

    frontend = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    sent = enviar_recuperacion_password(
        usuario.email, usuario.nombre, f"{frontend}/recuperar-password/{raw_token}", minutes
    )
    registrar(
        db, accion=Accion.RECUPERACION_SOLICITADA, recurso=Recurso.USUARIO,
        usuario=usuario, recurso_id=usuario.id,
        detalle={"correo_enviado": sent, "expira_minutos": minutes}, request=request,
    )
    return generic


@router.get("/password/reset/{token}", summary="Validar enlace de recuperación")
def validate_reset_token(token: str, db: Session = Depends(get_db)):
    if not _active_reset(db, token):
        raise HTTPException(status_code=400, detail="El enlace es inválido, ya fue utilizado o ha expirado.")
    return {"valido": True}


@router.post("/password/reset", summary="Restablecer contraseña")
def reset_password(data: ResetPasswordIn, request: Request, db: Session = Depends(get_db)):
    reset = _active_reset(db, data.token)
    if not reset:
        raise HTTPException(status_code=400, detail="El enlace es inválido, ya fue utilizado o ha expirado.")
    policy_error = password_policy_error(data.password)
    if policy_error:
        raise HTTPException(status_code=422, detail=policy_error)

    usuario = db.query(Usuario).filter(Usuario.id == reset.usuario_id, Usuario.activo.is_(True)).first()
    if not usuario:
        raise HTTPException(status_code=400, detail="El enlace es inválido, ya fue utilizado o ha expirado.")
    if verificar_password(data.password, usuario.password_hash):
        raise HTTPException(status_code=422, detail="La nueva contraseña debe ser diferente a la anterior.")

    now = utcnow_naive()
    usuario.password_hash = hashear_password(data.password)
    usuario.debe_cambiar_password = False
    db.query(PasswordResetToken).filter(
        PasswordResetToken.usuario_id == usuario.id,
        PasswordResetToken.usado_en.is_(None),
    ).update({PasswordResetToken.usado_en: now}, synchronize_session=False)
    db.commit()
    clear_login_failures(request, usuario.email)
    registrar(
        db, accion=Accion.RECUPERACION_USADA, recurso=Recurso.USUARIO,
        usuario=usuario, recurso_id=usuario.id, request=request,
    )
    return {"mensaje": "Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión."}


@router.get("/me", response_model=UsuarioResponse, summary="Usuario actual")
def me(current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    """Devuelve los datos del usuario autenticado (requiere token Bearer valido)."""
    return _serializar_usuario(current_user, db)


@router.post("/sessions/heartbeat", summary="Registrar sesion activa del navegador")
def session_heartbeat(
    data: SessionHeartbeatIn,
    request: Request,
    current_user: Usuario = Depends(get_current_user),
):
    sessions = register_session(
        usuario_id=current_user.id,
        session_id=data.session_id,
        user_agent=request.headers.get("user-agent", ""),
        path=data.path,
    )
    return {"active_sessions": sessions, "active_count": len(sessions)}


@router.post("/sessions/logout", summary="Cerrar registro de sesion activa")
def session_logout(
    data: SessionHeartbeatIn,
    current_user: Usuario = Depends(get_current_user),
):
    end_session(data.session_id)
    return {"ok": True}


@router.get("/sessions", summary="Listar sesiones activas propias")
def my_sessions(
    session_id: str | None = None,
    current_user: Usuario = Depends(get_current_user),
):
    sessions = list_user_sessions(current_user.id, current_session_id=session_id)
    return {"active_sessions": sessions, "active_count": len(sessions)}
