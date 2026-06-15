"""
test_siga_laboratorios.py -- Tests de integración para el módulo de laboratorios.

Cubre:
- CRUD de laboratorios (SUPER_ADMIN)
- Listado con filtros (solo_activos, tipo)
- Acceso por rol (LAB_ADMIN sólo ve su lab, DOCENTE sólo lectura)
- Computadoras: alta, edición, baja
- Alta masiva de computadoras (bulk)
- Validaciones de unicidad y campos requeridos
"""
import pytest
from tests.conftest import get_token, auth_headers
from dependencies import hashear_password
from models.usuario import Usuario, RolUsuario
from models.laboratorio import Laboratorio, Computadora
from models.inventario import Activo
from models.auditoria import AuditLog


# ─────────────────────────── helpers ────────────────────────────────────────

def _lab(db, nombre="Lab A", categoria="COMPUTO", activo=True):
    lab = Laboratorio(nombre=nombre, categoria=categoria,
                      ubicacion="Edificio X", capacidad=20, activo=activo)
    db.add(lab)
    db.commit()
    db.refresh(lab)
    return lab


def _usuario(db, nombre, email, rol, password="Test1234!", lab_id=None):
    u = Usuario(
        nombre=nombre, email=email,
        password_hash=hashear_password(password),
        rol=rol, activo=True,
        laboratorio_id=lab_id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _activo_computadora(db, lab, codigo):
    activo = Activo(
        laboratorio_id=lab.id,
        alcance="LABORATORIO",
        tipo_inventario="ACTIVO",
        estado_admin="VALIDADO",
        codigo_inventario=codigo,
        nombre=f"Computadora {codigo}",
        categoria="COMPUTADORA",
        marca="Dell",
        modelo="OptiPlex",
        numero_serie=f"SER-{codigo}",
        estado="OPERATIVO",
        cantidad=1,
        unidad_medida="PIEZA",
        activo=True,
    )
    db.add(activo)
    db.commit()
    db.refresh(activo)
    return activo


def _admin_token(client, db):
    _usuario(db, "Admin", "admin@lab.mx", RolUsuario.SUPER_ADMIN)
    return get_token(client, "admin@lab.mx", "Test1234!")


# ════════════════════════════════════════════════════════════════════════════
# CRUD básico — SUPER_ADMIN
# ════════════════════════════════════════════════════════════════════════════

class TestCrudLaboratorio:

    def test_crear_lab_computo(self, client, db):
        token = _admin_token(client, db)
        r = client.post("/laboratorios", json={
            "nombre": "Lab Cómputo 1", "categoria": "COMPUTO",
            "ubicacion": "Edificio A", "capacidad": 30,
        }, headers=auth_headers(token))
        assert r.status_code == 201
        data = r.json()
        assert data["nombre"] == "Lab Cómputo 1"
        assert data["activo"] is True

    def test_crear_lab_quimica(self, client, db):
        token = _admin_token(client, db)
        r = client.post("/laboratorios", json={
            "nombre": "Lab Química", "categoria": "QUIMICA",
            "ubicacion": "Edificio B", "capacidad": 15,
        }, headers=auth_headers(token))
        assert r.status_code == 201
        assert r.json()["categoria"] == "QUIMICA"

    def test_listar_labs(self, client, db):
        token = _admin_token(client, db)
        _lab(db, "Lab 1")
        _lab(db, "Lab 2")
        r = client.get("/laboratorios", headers=auth_headers(token))
        assert r.status_code == 200
        assert len(r.json()) >= 2

    def test_listar_solo_activos(self, client, db):
        token = _admin_token(client, db)
        _lab(db, "Activo", activo=True)
        _lab(db, "Inactivo", activo=False)
        r = client.get("/laboratorios?solo_activos=true", headers=auth_headers(token))
        nombres = [x["nombre"] for x in r.json()]
        assert "Activo" in nombres
        assert "Inactivo" not in nombres

    def test_editar_lab(self, client, db):
        token = _admin_token(client, db)
        lab = _lab(db, "Original")
        r = client.put(f"/laboratorios/{lab.id}", json={
            "nombre": "Editado", "ubicacion": "Nuevo edificio", "capacidad": 25,
        }, headers=auth_headers(token))
        assert r.status_code == 200
        assert r.json()["nombre"] == "Editado"

    def test_desactivar_lab(self, client, db):
        token = _admin_token(client, db)
        lab = _lab(db)
        r = client.delete(f"/laboratorios/{lab.id}", headers=auth_headers(token))
        assert r.status_code == 200
        r2 = client.get("/laboratorios?solo_activos=true", headers=auth_headers(token))
        ids = [x["id"] for x in r2.json()]
        assert lab.id not in ids

    def test_crear_lab_nombre_duplicado(self, client, db):
        token = _admin_token(client, db)
        _lab(db, "Lab Único")
        r = client.post("/laboratorios", json={
            "nombre": "Lab Único", "categoria": "COMPUTO",
            "ubicacion": "X", "capacidad": 10,
        }, headers=auth_headers(token))
        assert r.status_code in (400, 409, 422)

    def test_crear_lab_sin_nombre_falla(self, client, db):
        token = _admin_token(client, db)
        r = client.post("/laboratorios", json={
            "categoria": "COMPUTO", "ubicacion": "X", "capacidad": 10,
        }, headers=auth_headers(token))
        assert r.status_code == 422

    def test_lab_inexistente_404(self, client, db):
        token = _admin_token(client, db)
        r = client.put("/laboratorios/9999", json={
            "nombre": "Inexistente", "ubicacion": "Edificio X", "capacidad": 1,
        }, headers=auth_headers(token))
        assert r.status_code == 404


# ════════════════════════════════════════════════════════════════════════════
# Acceso por rol
# ════════════════════════════════════════════════════════════════════════════

class TestAccesoRoles:

    def test_lab_admin_solo_ve_su_lab(self, client, db):
        _usuario(db, "Admin SA", "admin@lab.mx", RolUsuario.SUPER_ADMIN)
        admin_tok = get_token(client, "admin@lab.mx", "Test1234!")

        lab1 = _lab(db, "Lab Admin Own")
        _lab(db, "Lab Otro")

        _usuario(db, "LA", "la@lab.mx", RolUsuario.LAB_ADMIN, lab_id=lab1.id)
        la_tok = get_token(client, "la@lab.mx", "Test1234!")

        r = client.get("/laboratorios", headers=auth_headers(la_tok))
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["id"] == lab1.id

    def test_docente_puede_listar(self, client, db):
        _usuario(db, "Admin SA", "admin@lab.mx", RolUsuario.SUPER_ADMIN)
        _lab(db, "Lab Visible")
        _usuario(db, "Doc", "doc@lab.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "doc@lab.mx", "Test1234!")
        r = client.get("/laboratorios", headers=auth_headers(tok))
        assert r.status_code == 200

    def test_responsable_lab_solo_ve_su_lab(self, client, db):
        lab_asignado = _lab(db, "Lab Responsable")
        lab_ajeno = _lab(db, "Lab No Asignado")
        _usuario(
            db,
            "Responsable",
            "responsable@lab.mx",
            RolUsuario.RESPONSABLE_LAB,
            lab_id=lab_asignado.id,
        )
        token = get_token(client, "responsable@lab.mx", "Test1234!")

        r = client.get(
            "/laboratorios?solo_activos=false",
            headers=auth_headers(token),
        )

        assert r.status_code == 200
        ids = [lab["id"] for lab in r.json()]
        assert ids == [lab_asignado.id]
        assert lab_ajeno.id not in ids

    def test_responsable_lab_no_puede_abrir_otro_lab(self, client, db):
        lab_asignado = _lab(db, "Lab Responsable")
        lab_ajeno = _lab(db, "Lab Ajeno")
        _usuario(
            db,
            "Responsable",
            "responsable@lab.mx",
            RolUsuario.RESPONSABLE_LAB,
            lab_id=lab_asignado.id,
        )
        token = get_token(client, "responsable@lab.mx", "Test1234!")

        propio = client.get(
            f"/laboratorios/{lab_asignado.id}",
            headers=auth_headers(token),
        )
        ajeno = client.get(
            f"/laboratorios/{lab_ajeno.id}",
            headers=auth_headers(token),
        )

        assert propio.status_code == 200
        assert ajeno.status_code == 403

    def test_docente_no_puede_crear(self, client, db):
        _usuario(db, "Doc", "doc@lab.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "doc@lab.mx", "Test1234!")
        r = client.post("/laboratorios", json={
            "nombre": "Nuevo", "categoria": "COMPUTO",
            "ubicacion": "X", "capacidad": 10,
        }, headers=auth_headers(tok))
        assert r.status_code == 403

    def test_sin_token_requiere_auth(self, client, db):
        r = client.get("/laboratorios")
        assert r.status_code == 401


# ════════════════════════════════════════════════════════════════════════════
# Computadoras
# ComputadoraCreate: numero (int), codigo (str requerido), fila?, specs?, estado?
# BulkComputadorasCreate: cantidad, prefijo_codigo
# ════════════════════════════════════════════════════════════════════════════

class TestComputadoras:

    def _setup(self, client, db):
        _usuario(db, "Admin SA", "admin@lab.mx", RolUsuario.SUPER_ADMIN)
        tok = get_token(client, "admin@lab.mx", "Test1234!")
        lab = _lab(db, "Lab Cómputo", "COMPUTO")
        return tok, lab

    def test_crear_computadora(self, client, db):
        tok, lab = self._setup(client, db)
        r = client.post(f"/laboratorios/{lab.id}/computadoras", json={
            "numero": 1,
            "codigo": "PC-01",
            "estado": "OPERATIVO",
        }, headers=auth_headers(tok))
        assert r.status_code == 201
        assert r.json()["numero"] == 1
        assert r.json()["codigo"] == "PC-01"

    def test_listar_computadoras(self, client, db):
        tok, lab = self._setup(client, db)
        client.post(f"/laboratorios/{lab.id}/computadoras", json={
            "numero": 1, "codigo": "PC-01",
        }, headers=auth_headers(tok))
        r = client.get(f"/laboratorios/{lab.id}/computadoras",
                       headers=auth_headers(tok))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_vincular_activo_patrimonial_a_computadora(self, client, db):
        tok, lab = self._setup(client, db)
        activo = _activo_computadora(db, lab, "PC-PAT-01")

        r = client.post(f"/laboratorios/{lab.id}/computadoras", json={
            "numero": 1,
            "codigo": "PC-01",
            "activo_id": activo.id,
        }, headers=auth_headers(tok))

        assert r.status_code == 201, r.text
        assert r.json()["activo_id"] == activo.id
        assert r.json()["activo"]["codigo_inventario"] == "PC-PAT-01"

        historial = client.get(
            f"/laboratorios/{lab.id}/computadoras/{r.json()['id']}/historial-activos",
            headers=auth_headers(tok),
        )
        assert historial.status_code == 200
        assert historial.json()[0]["activo_id"] == activo.id
        assert historial.json()[0]["fecha_fin"] is None

        detalle_activo = client.get(
            f"/inventario/activos/{activo.id}",
            headers=auth_headers(tok),
        )
        assert detalle_activo.status_code == 200
        assert detalle_activo.json()["computadora_id"] == r.json()["id"]
        assert detalle_activo.json()["computadora_codigo"] == "PC-01"

    def test_no_permite_vincular_un_activo_a_dos_pcs(self, client, db):
        tok, lab = self._setup(client, db)
        activo = _activo_computadora(db, lab, "PC-PAT-UNICA")
        primera = client.post(f"/laboratorios/{lab.id}/computadoras", json={
            "numero": 1, "codigo": "PC-01", "activo_id": activo.id,
        }, headers=auth_headers(tok))
        assert primera.status_code == 201

        segunda = client.post(f"/laboratorios/{lab.id}/computadoras", json={
            "numero": 2, "codigo": "PC-02", "activo_id": activo.id,
        }, headers=auth_headers(tok))
        assert segunda.status_code == 409

    def test_reemplazo_conserva_historial_de_activos(self, client, db):
        tok, lab = self._setup(client, db)
        anterior = _activo_computadora(db, lab, "PC-PAT-ANT")
        nuevo = _activo_computadora(db, lab, "PC-PAT-NVO")
        pc = client.post(f"/laboratorios/{lab.id}/computadoras", json={
            "numero": 1, "codigo": "PC-01", "activo_id": anterior.id,
        }, headers=auth_headers(tok)).json()

        reemplazo = client.put(
            f"/laboratorios/{lab.id}/computadoras/{pc['id']}",
            json={"activo_id": nuevo.id, "motivo_asignacion": "Renovación de equipo"},
            headers=auth_headers(tok),
        )
        assert reemplazo.status_code == 200, reemplazo.text
        assert reemplazo.json()["activo_id"] == nuevo.id

        historial = client.get(
            f"/laboratorios/{lab.id}/computadoras/{pc['id']}/historial-activos",
            headers=auth_headers(tok),
        ).json()
        assert len(historial) == 2
        assert historial[0]["activo_id"] == nuevo.id
        assert historial[0]["motivo"] == "Renovación de equipo"
        assert historial[1]["activo_id"] == anterior.id
        assert historial[1]["fecha_fin"] is not None

    def test_alta_masiva_computadoras(self, client, db):
        tok, lab = self._setup(client, db)
        r = client.post(f"/laboratorios/{lab.id}/computadoras/bulk", json={
            "cantidad": 5,
            "prefijo_codigo": "PC",
        }, headers=auth_headers(tok))
        assert r.status_code == 201
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 5

    def test_editar_computadora(self, client, db):
        tok, lab = self._setup(client, db)
        r = client.post(f"/laboratorios/{lab.id}/computadoras", json={
            "numero": 1, "codigo": "PC-01",
        }, headers=auth_headers(tok))
        comp_id = r.json()["id"]
        r2 = client.put(f"/laboratorios/{lab.id}/computadoras/{comp_id}", json={
            "numero": 1, "codigo": "PC-01-ED", "estado": "MANTENIMIENTO",
        }, headers=auth_headers(tok))
        assert r2.status_code == 200
        assert r2.json()["estado"] == "MANTENIMIENTO"

    def test_no_permite_numero_duplicado_en_el_mismo_lab(self, client, db):
        tok, lab = self._setup(client, db)
        client.post(
            f"/laboratorios/{lab.id}/computadoras",
            json={"numero": 22, "codigo": "PC-22"},
            headers=auth_headers(tok),
        )

        duplicada = client.post(
            f"/laboratorios/{lab.id}/computadoras",
            json={"numero": 22, "codigo": "PC-NUEVA"},
            headers=auth_headers(tok),
        )

        assert duplicada.status_code == 409
        assert "número" in duplicada.json()["detail"]

    def test_no_permite_codigo_equivalente_duplicado(self, client, db):
        tok, lab = self._setup(client, db)
        client.post(
            f"/laboratorios/{lab.id}/computadoras",
            json={"numero": 22, "codigo": "PC--22"},
            headers=auth_headers(tok),
        )

        duplicada = client.post(
            f"/laboratorios/{lab.id}/computadoras",
            json={"numero": 23, "codigo": " pc-22 "},
            headers=auth_headers(tok),
        )

        assert duplicada.status_code == 409
        assert "código" in duplicada.json()["detail"]

    def test_no_permite_editar_pc_con_numero_de_otra(self, client, db):
        tok, lab = self._setup(client, db)
        primera = client.post(
            f"/laboratorios/{lab.id}/computadoras",
            json={"numero": 21, "codigo": "PC-21"},
            headers=auth_headers(tok),
        ).json()
        segunda = client.post(
            f"/laboratorios/{lab.id}/computadoras",
            json={"numero": 22, "codigo": "PC-22"},
            headers=auth_headers(tok),
        ).json()

        conflicto = client.put(
            f"/laboratorios/{lab.id}/computadoras/{segunda['id']}",
            json={"numero": primera["numero"]},
            headers=auth_headers(tok),
        )

        assert conflicto.status_code == 409

    def test_responsable_puede_agregar_y_editar_pc_de_su_lab(self, client, db):
        lab = _lab(db, "Lab Responsable", "COMPUTO")
        _usuario(
            db,
            "Responsable",
            "responsable@lab.mx",
            RolUsuario.RESPONSABLE_LAB,
            lab_id=lab.id,
        )
        token = get_token(client, "responsable@lab.mx", "Test1234!")

        alta = client.post(
            f"/laboratorios/{lab.id}/computadoras",
            json={
                "numero": 23,
                "codigo": "PC-23",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )

        assert alta.status_code == 201
        pc_id = alta.json()["id"]

        edicion = client.put(
            f"/laboratorios/{lab.id}/computadoras/{pc_id}",
            json={
                "specs": "Equipo nuevo",
                "activa": False,
            },
            headers=auth_headers(token),
        )

        assert edicion.status_code == 200
        assert edicion.json()["specs"] == "Equipo nuevo"
        assert edicion.json()["activa"] is False

        acciones = {
            log.accion
            for log in db.query(AuditLog)
            .filter(AuditLog.usuario_email == "responsable@lab.mx")
            .all()
        }
        assert "AGREGAR_PC" in acciones
        assert "EDITAR_PC" in acciones

    def test_responsable_no_puede_modificar_pc_de_otro_lab(self, client, db):
        lab_asignado = _lab(db, "Lab Responsable", "COMPUTO")
        lab_ajeno = _lab(db, "Lab Ajeno", "COMPUTO")
        _usuario(
            db,
            "Responsable",
            "responsable@lab.mx",
            RolUsuario.RESPONSABLE_LAB,
            lab_id=lab_asignado.id,
        )
        token = get_token(client, "responsable@lab.mx", "Test1234!")

        alta_ajena = client.post(
            f"/laboratorios/{lab_ajeno.id}/computadoras",
            json={"numero": 1, "codigo": "AJENA-01"},
            headers=auth_headers(token),
        )

        assert alta_ajena.status_code == 403

        pc_ajena = Computadora(
            laboratorio_id=lab_ajeno.id,
            numero=1,
            codigo="AJENA-01",
            estado="OPERATIVO",
            activa=True,
        )
        db.add(pc_ajena)
        db.commit()
        db.refresh(pc_ajena)

        edicion_ajena = client.put(
            f"/laboratorios/{lab_ajeno.id}/computadoras/{pc_ajena.id}",
            json={"estado": "MANTENIMIENTO"},
            headers=auth_headers(token),
        )

        assert edicion_ajena.status_code == 403

    def test_responsable_no_puede_hacer_carga_masiva(self, client, db):
        lab = _lab(db, "Lab Responsable", "COMPUTO")
        _usuario(
            db,
            "Responsable",
            "responsable@lab.mx",
            RolUsuario.RESPONSABLE_LAB,
            lab_id=lab.id,
        )
        token = get_token(client, "responsable@lab.mx", "Test1234!")

        r = client.post(
            f"/laboratorios/{lab.id}/computadoras/bulk",
            json={"cantidad": 2, "prefijo_codigo": "PC"},
            headers=auth_headers(token),
        )

        assert r.status_code == 403
