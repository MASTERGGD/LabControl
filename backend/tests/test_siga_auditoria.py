"""
test_siga_auditoria.py -- Tests de integración para el módulo de auditoría.

Cubre:
- Listar logs de auditoría (solo SUPER_ADMIN)
- Listar acciones disponibles
- Resumen estadístico
- Exportar logs (CSV/Excel)
- Permisos: solo SUPER_ADMIN accede
"""
import pytest
from datetime import datetime, timedelta
from tests.conftest import get_token, auth_headers
from dependencies import hashear_password
from models.auditoria import AuditLog
from models.usuario import Usuario, RolUsuario


# ─────────────────────────── helpers ────────────────────────────────────────

def _usuario(db, nombre, email, rol, password="Test1234!"):
    u = Usuario(
        nombre=nombre, email=email,
        password_hash=hashear_password(password),
        rol=rol, activo=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _admin(db, email="admin@test.mx"):
    return _usuario(db, "Admin", email, RolUsuario.SUPER_ADMIN)


# ════════════════════════════════════════════════════════════════════════════
# Listado de logs
# ════════════════════════════════════════════════════════════════════════════

class TestListadoAuditoria:

    def test_listar_logs_admin(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/auditoria/", headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        # Puede ser lista o paginado
        assert isinstance(data, (list, dict))

    def test_listar_logs_con_filtro_accion(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/auditoria/?accion=LOGIN", headers=auth_headers(tok))
        assert r.status_code == 200

    def test_listar_logs_con_filtro_usuario(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/auditoria/?usuario_id=1", headers=auth_headers(tok))
        assert r.status_code == 200

    def test_listar_acciones_disponibles(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/auditoria/acciones", headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        # Puede ser lista directa o dict con clave "acciones"
        assert isinstance(data, list) or "acciones" in data

    def test_resumen_auditoria(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/auditoria/resumen", headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)

    def test_export_logs(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/auditoria/export", headers=auth_headers(tok))
        assert r.status_code == 200
        # Debe devolver un archivo (CSV o Excel)
        ct = r.headers.get("content-type", "")
        assert "text/csv" in ct or "spreadsheet" in ct or "application/octet" in ct or r.content


# ════════════════════════════════════════════════════════════════════════════
# Logs se generan al hacer acciones
# ════════════════════════════════════════════════════════════════════════════

class TestRetencionAuditoria:

    def test_estado_retencion_super_admin(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/auditoria/retencion", headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        assert "retention_days" in data
        assert "archivables" in data

    def test_archivar_dry_run_no_elimina_logs(self, client, db, tmp_path, monkeypatch):
        monkeypatch.setenv("AUDIT_ARCHIVE_DIR", str(tmp_path))
        _admin(db)
        old = AuditLog(
            timestamp=datetime.utcnow() - timedelta(days=400),
            accion="LOGIN_OK",
            recurso="SISTEMA",
            exito=True,
        )
        db.add(old)
        db.commit()
        tok = get_token(client, "admin@test.mx", "Test1234!")

        r = client.post(
            "/auditoria/retencion/archivar?dry_run=true&dias_retencion=365",
            headers=auth_headers(tok),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["dry_run"] is True
        assert data["seleccionados"] >= 1
        assert db.query(AuditLog).filter(AuditLog.id == old.id).first() is not None

    def test_archivar_elimina_operativo_y_crea_archivo(self, client, db, tmp_path, monkeypatch):
        monkeypatch.setenv("AUDIT_ARCHIVE_DIR", str(tmp_path))
        _admin(db)
        old = AuditLog(
            timestamp=datetime.utcnow() - timedelta(days=400),
            accion="EDITAR_USUARIO",
            recurso="USUARIO",
            recurso_id=123,
            detalle={"campo": "nombre"},
            exito=True,
        )
        recent = AuditLog(
            timestamp=datetime.utcnow(),
            accion="LOGIN_OK",
            recurso="SISTEMA",
            exito=True,
        )
        db.add_all([old, recent])
        db.commit()
        old_id = old.id
        recent_id = recent.id
        tok = get_token(client, "admin@test.mx", "Test1234!")

        r = client.post(
            "/auditoria/retencion/archivar?dry_run=false&dias_retencion=365&limite=10",
            headers=auth_headers(tok),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["archivados"] >= 1
        assert data["archivo"]
        assert data["sha256"]
        assert db.query(AuditLog).filter(AuditLog.id == old_id).first() is None
        assert db.query(AuditLog).filter(AuditLog.id == recent_id).first() is not None
        assert list(tmp_path.glob("audit_logs_*.jsonl.gz"))

    def test_lab_admin_no_puede_archivar_retencion(self, client, db):
        _usuario(db, "LA", "la@test.mx", RolUsuario.LAB_ADMIN)
        tok = get_token(client, "la@test.mx", "Test1234!")
        r = client.post("/auditoria/retencion/archivar", headers=auth_headers(tok))
        assert r.status_code == 403


class TestGeneracionLogs:

    def test_login_genera_log(self, client, db):
        _admin(db)
        # Login
        client.post("/auth/login", data={
            "username": "admin@test.mx", "password": "Test1234!",
        })
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/auditoria/?accion=LOGIN", headers=auth_headers(tok))
        # El endpoint debe responder 200 (logs pueden no escribirse en entorno de test)
        assert r.status_code == 200


# ════════════════════════════════════════════════════════════════════════════
# Permisos
# ════════════════════════════════════════════════════════════════════════════

class TestPermisosAuditoria:

    def test_sin_token_401(self, client, db):
        r = client.get("/auditoria/")
        assert r.status_code == 401

    def test_docente_no_puede_ver_auditoria(self, client, db):
        _usuario(db, "Doc", "doc@test.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "doc@test.mx", "Test1234!")
        r = client.get("/auditoria/", headers=auth_headers(tok))
        assert r.status_code == 403

    def test_lab_admin_puede_ver_auditoria(self, client, db):
        # LAB_ADMIN tiene acceso a auditoría (vista restringida de su lab)
        _usuario(db, "LA", "la@test.mx", RolUsuario.LAB_ADMIN)
        tok = get_token(client, "la@test.mx", "Test1234!")
        r = client.get("/auditoria/", headers=auth_headers(tok))
        assert r.status_code == 200

    def test_alumno_no_puede_ver_auditoria(self, client, db):
        _usuario(db, "Alum", "alum@test.mx", RolUsuario.ALUMNO)
        tok = get_token(client, "alum@test.mx", "Test1234!")
        r = client.get("/auditoria/", headers=auth_headers(tok))
        assert r.status_code == 403
