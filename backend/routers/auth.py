from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models.usuario import Usuario, RolUsuario
from dependencies import get_current_user, crear_access_token, verificar_password
import datetime

router = APIRouter(prefix="/auth", tags=["Autenticación"])


# ─── Schemas ───────────────────────────────────────────────────────────────────

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

    class Config:
        from_attributes = True


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse, summary="Iniciar sesión")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Autentica al usuario con email y contraseña.
    Devuelve un JWT válido por 8 horas y los datos básicos del usuario.
    """
    usuario = db.query(Usuario).filter(
        Usuario.email == form_data.username
    ).first()

    if not usuario or not verificar_password(form_data.password, usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta cuenta está desactivada. Contacta al administrador del sistema.",
        )

    token_data = {
        "sub": str(usuario.id),
        "email": usuario.email,
        "rol": usuario.rol.value,
        "lab_id": usuario.laboratorio_id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=8)
    }
    token = crear_access_token(token_data)

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
        }
    }


@router.get("/me", response_model=UsuarioResponse, summary="Usuario actual")
def me(current_user: Usuario = Depends(get_current_user)):
    """
    Devuelve los datos del usuario autenticado (requiere token Bearer válido).
    """
    return current_user
