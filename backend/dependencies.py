from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from passlib.context import CryptContext
from database import get_db
from models.usuario import Usuario, RolUsuario
import os

# ─── Configuración ─────────────────────────────────────────────────────────────

_SECRET_KEY_ENV = os.getenv("SECRET_KEY", "")
_APP_ENV        = os.getenv("APP_ENV", "development")

if not _SECRET_KEY_ENV:
    if _APP_ENV == "production":
        raise RuntimeError(
            "SECRET_KEY no configurada. "
            "Define la variable de entorno SECRET_KEY antes de iniciar en produccion."
        )
    # Desarrollo: usar clave de fallback con advertencia visible
    import warnings
    _SECRET_KEY_ENV = "labcontrol-dev-insecure-key-do-not-use-in-production"
    warnings.warn(
        "SECRET_KEY no configurada — usando clave de desarrollo insegura. "
        "Configura SECRET_KEY en .env para produccion.",
        stacklevel=2,
    )

SECRET_KEY = _SECRET_KEY_ENV
ALGORITHM  = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ─── Utilidades de contraseña ──────────────────────────────────────────────────

def hashear_password(password: str) -> str:
    return pwd_context.hash(password)

def verificar_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─── Utilidades de JWT ─────────────────────────────────────────────────────────

def crear_access_token(data: dict) -> str:
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)

def decodificar_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# ─── Dependency: usuario autenticado ──────────────────────────────────────────

# Operaciones exactas permitidas mientras el usuario tiene cambio pendiente.
# La ruta sale del scope ASGI, no de request.url ni de headers manipulables.
_OPERACIONES_PERMITIDAS_CAMBIO_PENDIENTE = frozenset({
    ("GET", "/auth/me"),
    ("PUT", "/usuarios/me/password"),
    ("POST", "/auth/sessions/heartbeat"),
    ("POST", "/auth/sessions/logout"),
    ("GET", "/auth/sessions"),
})


def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Usuario:
    credencial_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado o token inválido",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decodificar_token(token)
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credencial_exception
    except JWTError:
        raise credencial_exception

    usuario = db.query(Usuario).filter(
        Usuario.id == int(user_id),
        Usuario.activo == True
    ).first()

    if usuario is None:
        raise credencial_exception

    # Cambio de contraseña obligatorio: bloquear todo excepto la allowlist.
    if bool(getattr(usuario, "debe_cambiar_password", False)):
        operation = (
            request.method.upper(),
            str(request.scope.get("path") or ""),
        )
        if operation not in _OPERACIONES_PERMITIDAS_CAMBIO_PENDIENTE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Debes cambiar tu contraseña antes de continuar.",
                headers={"X-Password-Change-Required": "true"},
            )

    return usuario


# ─── Factory: requerir rol(es) específico(s) ───────────────────────────────────

def require_roles(*roles: RolUsuario):
    """
    Uso:
        @router.get("/admin", dependencies=[Depends(require_roles(RolUsuario.SUPER_ADMIN))])
        @router.get("/docentes", dependencies=[Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))])
    """
    def _check(current_user: Usuario = Depends(get_current_user)):
        if current_user.rol not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acceso denegado. Se requiere uno de los roles: {[r.value for r in roles]}"
            )
        return current_user
    return _check
