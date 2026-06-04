from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from database import get_db
from models.departamento import Departamento
from models.usuario import Usuario, RolUsuario
from dependencies import get_current_user, crear_access_token, verificar_password
from services.auditoria import registrar, Accion, Recurso
from services.active_sessions import end_session, list_user_sessions, register_session
from services.rate_limit import clear_login_failures, ensure_login_not_locked, register_login_failure
from services.user_permissions import permisos_efectivos
import datetime
import os

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
    laboratorio_id: int | None
    departamento_id: int | None = None
    departamento_nombre: str | None = None
    departamento_clave: str | None = None
    permisos: list[str] = []
    activo: bool

    model_config = ConfigDict(from_attributes=True)


class SessionHeartbeatIn(BaseModel):
    session_id: str
    path: str | None = None


def _serializar_usuario(usuario: Usuario, db: Session) -> dict:
    dep = None
    if usuario.departamento_id:
        dep = db.query(Departamento).filter(Departamento.id == usuario.departamento_id).first()
    return {
        "id": usuario.id,
        "nombre": usuario.nombre,
        "email": usuario.email,
        "rol": usuario.rol.value,
        "laboratorio_id": usuario.laboratorio_id,
        "departamento_id": usuario.departamento_id,
        "departamento_nombre": dep.nombre if dep else None,
        "departamento_clave": dep.clave if dep else None,
        "permisos": permisos_efectivos(db, usuario),
        "activo": usuario.activo,
        "acceso_consultorio": bool(usuario.acceso_consultorio),
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
