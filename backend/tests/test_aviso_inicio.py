from datetime import date
from pathlib import Path
from runpy import run_path
from types import SimpleNamespace

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from database import get_db
from dependencies import get_current_user
from models.usuario import RolUsuario
from routers import aviso_inicio


@pytest.fixture(autouse=True)
def reset_db():
    """Cada caso aplica la migración en su propia base SQLite en memoria."""


@pytest.fixture
def avisos(monkeypatch):
    monkeypatch.setattr(aviso_inicio, "_hoy", lambda: date(2026, 11, 23))
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    migracion = Path(__file__).resolve().parents[1] / "alembic/versions/da08d4151ba2_aviso_inicio_docente.py"
    with engine.begin() as conn, Operations.context(MigrationContext.configure(conn)):
        run_path(str(migracion))["upgrade"]()

    def db():
        with Session(engine) as session:
            yield session

    app = FastAPI()
    app.include_router(aviso_inicio.router)
    app.dependency_overrides[get_db] = db
    usuario = SimpleNamespace(rol=RolUsuario.SUPER_ADMIN)
    app.dependency_overrides[get_current_user] = lambda: usuario
    with TestClient(app) as client:
        yield client, usuario
    engine.dispose()


def test_publicar_editar_y_retirar_solo_como_superadministrador(avisos):
    client, usuario = avisos
    payload = {"titulo": " Cierre del cuatrimestre ", "mensaje": "Revisa tus avances.",
               "destino": "seguimiento", "vigente_hasta": "2026-11-23"}
    assert client.get("/aviso-inicio/admin").json() is None
    assert client.get("/aviso-inicio/activo").status_code == 403
    assert client.put("/aviso-inicio/admin", json={**payload, "vigente_hasta": "2026-11-22"}).status_code == 422
    assert client.put("/aviso-inicio/admin", json={**payload, "destino": "https://example.com"}).status_code == 422
    guardado = client.put("/aviso-inicio/admin", json=payload)
    assert guardado.status_code == 200, guardado.text
    primero = guardado.json()
    assert primero["titulo"] == "Cierre del cuatrimestre"
    assert primero["expira_en"] == "2026-11-24T00:00:00-06:00"
    editado = client.put("/aviso-inicio/admin", json={**payload, "mensaje": "Revisa tus clases."}).json()
    assert editado["revision"] != primero["revision"]
    assert client.delete(f"/aviso-inicio/admin/{primero['revision']}").status_code == 409

    usuario.rol = RolUsuario.DOCENTE
    activo = client.get("/aviso-inicio/activo")
    assert activo.json() == editado
    assert activo.headers["Cache-Control"] == "no-store"
    assert client.get("/aviso-inicio/admin").status_code == 403
    assert client.put("/aviso-inicio/admin", json=payload).status_code == 403
    assert client.delete(f"/aviso-inicio/admin/{editado['revision']}").status_code == 403

    usuario.rol = RolUsuario.SUPER_ADMIN
    assert client.delete(f"/aviso-inicio/admin/{editado['revision']}").status_code == 204
    usuario.rol = RolUsuario.DOCENTE
    assert client.get("/aviso-inicio/activo").json() is None


def test_el_aviso_vence_al_terminar_la_fecha_indicada(avisos, monkeypatch):
    client, usuario = avisos
    assert client.put("/aviso-inicio/admin", json={
        "titulo": "Aviso", "mensaje": "Revisa tus clases.", "vigente_hasta": "2026-11-23",
    }).status_code == 200
    monkeypatch.setattr(aviso_inicio, "_hoy", lambda: date(2026, 11, 24))
    assert client.get("/aviso-inicio/admin").json()["activo"] is False
    usuario.rol = RolUsuario.DOCENTE
    assert client.get("/aviso-inicio/activo").json() is None
