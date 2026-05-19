"""
conftest.py -- Fixtures compartidos para todos los tests de integracion.

Estrategia:
  - Se crea una test_app limpia (FastAPI sin lifespan) que comparte los mismos
    routers del backend. Esto evita que Alembic o el seed interfieran.
  - SQLite en archivo temporal del sistema (portable: Linux, macOS, Windows).
  - Las tablas se crean con Base.metadata.create_all antes de cada test.
  - La dependencia get_db se sobreescribe con el engine de test.
"""
import os
import sys
import tempfile
import atexit

# -- sys.path: poner backend/ al frente ANTES de cualquier import ---------------
_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

# -- Variables de entorno de test -----------------------------------------------
_tmp_fd, TEST_DB_PATH = tempfile.mkstemp(prefix="labcontrol_pytest_", suffix=".db")
os.close(_tmp_fd)

TEST_DATABASE_URL = "sqlite:///" + TEST_DB_PATH

os.environ["DATABASE_URL"]           = TEST_DATABASE_URL
os.environ["SECRET_KEY"]             = "test-secret-key-for-pytest-only"
os.environ["APP_ENV"]                = "testing"
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"

# -- Imports del backend --------------------------------------------------------
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
from models.usuario import Usuario, RolUsuario
from models.cumplimiento import EventoCumplimiento  # noqa: F401
from models.laboratorio import Laboratorio
from dependencies import hashear_password

# -- Engine de test -------------------------------------------------------------
engine_test = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def _cleanup_test_db():
    engine_test.dispose()
    try:
        if os.path.exists(TEST_DB_PATH):
            os.unlink(TEST_DB_PATH)
    except PermissionError:
        pass


atexit.register(_cleanup_test_db)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# -- Test app: FastAPI limpia, sin lifespan, con los mismos routers -------------
from routers import (
    auth as auth_router,
    laboratorios as laboratorios_router,
    usuarios as usuarios_router,
    sesiones as sesiones_router,
    inventario as inventario_router,
    auditoria as auditoria_router,
    reportes as reportes_router,
    notificaciones as notificaciones_router,
    horarios as horarios_router,
    catalogo as catalogo_router,
    rbac as rbac_router,
    asistencia as asistencia_router,
    historial as historial_router,
    adeudos as adeudos_router,
)

test_app = FastAPI(title="LabControl-Test", docs_url=None)
test_app.include_router(auth_router.router)
test_app.include_router(laboratorios_router.router)
test_app.include_router(usuarios_router.router)
test_app.include_router(sesiones_router.router)
test_app.include_router(inventario_router.router)
test_app.include_router(auditoria_router.router)
test_app.include_router(reportes_router.router)
test_app.include_router(notificaciones_router.router)
test_app.include_router(horarios_router.router)
test_app.include_router(catalogo_router.router)
test_app.include_router(rbac_router.router)
test_app.include_router(asistencia_router.router)
test_app.include_router(historial_router.router)
test_app.include_router(adeudos_router.router)

test_app.dependency_overrides[get_db] = override_get_db


# -- Fixtures -------------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_db():
    """Recrea todas las tablas antes de cada test usando drop_all + create_all."""
    Base.metadata.drop_all(bind=engine_test)
    Base.metadata.create_all(bind=engine_test)
    yield
    Base.metadata.drop_all(bind=engine_test)


@pytest.fixture()
def db():
    """Sesion directa de BD para crear datos de prueba."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client():
    """Cliente HTTP de prueba apuntando a test_app (sin lifespan)."""
    with TestClient(test_app, raise_server_exceptions=True) as c:
        yield c


# -- Usuarios de prueba ---------------------------------------------------------

@pytest.fixture()
def admin_user(db):
    user = Usuario(
        nombre="Admin Test",
        email="admin@test.com",
        password_hash=hashear_password("AdminPass123"),
        rol=RolUsuario.SUPER_ADMIN,
        activo=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def docente_user(db):
    user = Usuario(
        nombre="Docente Test",
        email="docente@test.com",
        password_hash=hashear_password("DocentePass123"),
        rol=RolUsuario.DOCENTE,
        activo=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def lab(db):
    laboratorio = Laboratorio(
        nombre="Lab Test A",
        ubicacion="Edificio 1",
        capacidad=20,
        activo=True,
    )
    db.add(laboratorio)
    db.commit()
    db.refresh(laboratorio)
    return laboratorio


# -- Helpers de autenticacion ---------------------------------------------------

def get_token(client, email, password):
    resp = client.post("/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return f"Bearer {resp.json()['access_token']}"


def auth_headers(token: str) -> dict:
    """Wraps a Bearer token string into an Authorization header dict."""
    return {"Authorization": token}
