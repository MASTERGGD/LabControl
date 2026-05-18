from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from database import get_db
from models.usuario import Usuario, RolUsuario
from dependencies import get_current_user, crear_access_token, verificar_password
from services.auditoria import registrar, Accion, Recurso
import datetime
import os

# Duracion del token leida desde la variable de entorno ACCESS_TOKEN_EXPIRE_HOURS.
# Si no esta definida se usa 8 horas como valor por defecto.
_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "8"))

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
    activo: bool

    model_config = ConfigDict(from_attributes=True)


# --- Endpoints ----------------------------------------------------------------

@router.post("/login", response_model=TokenResponse, summary="Iniciar sesion")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Autentica al usuario con email y contrasena.
    Vigencia configurada con ACCESS_TOKEN_EXPIRE_HOURS (por defecto 8 horas).
    """
    usuario = db.query(Usuario).filter(
        Usuario.email == form_data.username
    ).first()

    if not usuario or not verificar_password(form_data.password, usuario.password_hash):
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
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=_TOKEN_EXPIRE_HOURS),
    }
    token = crear_access_token(token_data)

    registrar(db, accion=Accion.LOGIN_OK, recurso=Recurso.SISTEMA,
              usuario=usuario, request=request)

    return {
        "access_token": token,
        "token_type": "bearer",
        "usuario": {
            "id": usuario.id,
            "nombre": usuario.nombre,
            "email": usuario.email,
            "rol": usuario.rol.value,
            "laboratorio_id": usuario.laboratorio_id,
            "activo": usuario.activo,
        },
    }


@router.get("/me", response_model=UsuarioResponse, summary="Usuario actual")
def me(current_user: Usuario = Depends(get_current_user)):
    """Devuelve los datos del usuario autenticado (requiere token Bearer valido)."""
    return current_user
