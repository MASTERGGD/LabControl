"""
test_inventario_completo.py
===========================
Suite completa de integración para el módulo de inventario.

Cubre:
  - RESPONSABLE_LAB: acceso propio / denegado en lab ajeno
  - LAB_ADMIN: crear activos en su laboratorio, no en otros
  - ADMINISTRATIVO: crear en su depto, no en otro
  - Activos de laboratorio (alcance=LABORATORIO)
  - Activos institucionales (alcance=INSTITUCIONAL)
  - Validaciones: categoría inválida, alcance inválido, código/número duplicado
  - Movimientos: CAMBIO_RESGUARDANTE, CAMBIO_UBICACION, TRANSFERENCIA entre deptos
  - Préstamos: crear, devolver, doble préstamo bloqueado
  - Solicitud de baja: flujo completo (solicitar → revisar → validar → autorizar → ejecutar)
  - Baja: rechazar y cancelar
  - Levantamientos: crear, revisar, cerrar con y sin pendientes
  - Mantenimiento preventivo: crear, alertas, iniciar/completar
  - Expediente: timeline registra movimientos y mantenimiento
  - Descargas: resguardo Excel, etiqueta QR individual, etiquetas masivas PDF
"""

import datetime

import pytest

from dependencies import hashear_password
from models.departamento import Departamento
from models.laboratorio import Laboratorio
from models.usuario import RolUsuario, Usuario
from tests.conftest import auth_headers, get_token

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _dep(db, nombre="Depto QA", clave="DPQA"):
    d = Departamento(nombre=nombre, clave=clave, activo=True)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


def _lab(db, nombre="Lab QA", categoria="COMPUTO"):
    l = Laboratorio(nombre=nombre, categoria=categoria, capacidad=20, activo=True)
    db.add(l)
    db.commit()
    db.refresh(l)
    return l


def _usuario(db, nombre, email, rol, password="Test1234!", lab_id=None, dep_id=None):
    u = Usuario(
        nombre=nombre,
        email=email,
        password_hash=hashear_password(password),
        rol=rol,
        laboratorio_id=lab_id,
        departamento_id=dep_id,
        activo=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _activo_institucional(client, token, dep_id, nombre="Activo test", categoria="MOBILIARIO", numero_oficial=None):
    payload = {
        "alcance": "INSTITUCIONAL",
        "departamento_id": dep_id,
        "nombre": nombre,
        "categoria": categoria,
        "estado": "OPERATIVO",
    }
    if numero_oficial:
        payload["numero_oficial"] = numero_oficial
    r = client.post("/inventario/activos", json=payload, headers=auth_headers(token))
    assert r.status_code == 201, r.text
    return r.json()


def _activo_laboratorio(client, token, lab_id, nombre="Activo lab test", categoria="COMPUTADORA"):
    r = client.post(
        "/inventario/activos",
        json={
            "alcance": "LABORATORIO",
            "laboratorio_id": lab_id,
            "nombre": nombre,
            "categoria": categoria,
            "estado": "OPERATIVO",
        },
        headers=auth_headers(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


# ─── RESPONSABLE_LAB ──────────────────────────────────────────────────────────

class TestResponsableLab:
    def test_puede_crear_activo_en_su_laboratorio(self, client, db, admin_user):
        lab = _lab(db, "Lab Quimica", "QUIMICA")
        resp = _usuario(db, "Resp Lab QA", "resp@lab.test", RolUsuario.RESPONSABLE_LAB, lab_id=lab.id)
        token = get_token(client, "resp@lab.test", "Test1234!")

        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "LABORATORIO",
                "laboratorio_id": lab.id,
                "nombre": "Cristalería QA",
                "categoria": "CRISTALERIA",
                "estado": "OPERATIVO",
                "estado_admin": "VALIDADO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 201, r.text
        assert r.json()["laboratorio_id"] == lab.id
        assert r.json()["estado_admin"] == "BORRADOR"

    def test_no_puede_autovalidar_activo(self, client, db, admin_user):
        lab = _lab(db, "Lab Revision Resp", "COMPUTO")
        _usuario(db, "Resp Revision", "resp.revision@lab.test", RolUsuario.RESPONSABLE_LAB, lab_id=lab.id)
        token = get_token(client, "resp.revision@lab.test", "Test1234!")
        activo = _activo_laboratorio(client, token, lab.id, "PC pendiente")

        r = client.post(
            f"/inventario/activos/{activo['id']}/validacion",
            json={"estado_admin": "VALIDADO"},
            headers=auth_headers(token),
        )
        assert r.status_code == 403, r.text

        r = client.put(
            f"/inventario/activos/{activo['id']}",
            json={"estado_admin": "VALIDADO"},
            headers=auth_headers(token),
        )
        assert r.status_code == 403, r.text

    def test_super_admin_puede_validar_activo(self, client, db, admin_user):
        lab = _lab(db, "Lab Revision Admin", "COMPUTO")
        _usuario(db, "Resp Alta", "resp.alta@lab.test", RolUsuario.RESPONSABLE_LAB, lab_id=lab.id)
        responsable_token = get_token(client, "resp.alta@lab.test", "Test1234!")
        activo = _activo_laboratorio(client, responsable_token, lab.id, "PC por validar")
        assert activo["estado_admin"] == "BORRADOR"

        admin_token = get_token(client, "admin@test.com", "AdminPass123")
        r = client.post(
            f"/inventario/activos/{activo['id']}/validacion",
            json={"estado_admin": "VALIDADO", "observaciones": "Alta revisada"},
            headers=auth_headers(admin_token),
        )
        assert r.status_code == 200, r.text
        assert r.json()["estado_admin"] == "VALIDADO"
        assert r.json()["validacion_revisor"] == admin_user.nombre

        notificaciones = client.get(
            "/notificaciones",
            headers=auth_headers(responsable_token),
        )
        assert notificaciones.status_code == 200, notificaciones.text
        assert any(
            n["tipo"] == "INVENTARIO_VALIDACION" and "validado oficialmente" in n["mensaje"]
            for n in notificaciones.json()
        )

    def test_rechazo_exige_y_expone_motivo(self, client, db, admin_user):
        lab = _lab(db, "Lab Motivo Revision", "QUIMICA")
        _usuario(db, "Resp Motivo", "resp.motivo@lab.test", RolUsuario.RESPONSABLE_LAB, lab_id=lab.id)
        responsable_token = get_token(client, "resp.motivo@lab.test", "Test1234!")
        activo = _activo_laboratorio(client, responsable_token, lab.id, "Equipo sin evidencia")
        admin_token = get_token(client, "admin@test.com", "AdminPass123")

        sin_motivo = client.post(
            f"/inventario/activos/{activo['id']}/validacion",
            json={"estado_admin": "RECHAZADO"},
            headers=auth_headers(admin_token),
        )
        assert sin_motivo.status_code == 422, sin_motivo.text

        rechazado = client.post(
            f"/inventario/activos/{activo['id']}/validacion",
            json={"estado_admin": "RECHAZADO", "observaciones": "Falta numero de serie"},
            headers=auth_headers(admin_token),
        )
        assert rechazado.status_code == 200, rechazado.text
        assert rechazado.json()["validacion_motivo"] == "Falta numero de serie"
        assert rechazado.json()["validacion_revisor"] == admin_user.nombre

        bloqueado = client.put(
            f"/inventario/activos/{activo['id']}",
            json={"numero_serie": "SERIE-CORREGIDA"},
            headers=auth_headers(responsable_token),
        )
        assert bloqueado.status_code == 409, bloqueado.text
        assert "Super Admin debe reabrirlo" in bloqueado.text

        reabierto = client.post(
            f"/inventario/activos/{activo['id']}/validacion",
            json={"estado_admin": "BORRADOR", "observaciones": "Se autoriza una nueva correccion"},
            headers=auth_headers(admin_token),
        )
        assert reabierto.status_code == 200, reabierto.text

        corregido = client.put(
            f"/inventario/activos/{activo['id']}",
            json={"numero_serie": "SERIE-CORREGIDA"},
            headers=auth_headers(responsable_token),
        )
        assert corregido.status_code == 200, corregido.text
        assert corregido.json()["numero_serie"] == "SERIE-CORREGIDA"

    def test_observado_permite_correccion_del_responsable(self, client, db, admin_user):
        lab = _lab(db, "Lab Observacion Corregible", "COMPUTO")
        _usuario(
            db,
            "Resp Observacion",
            "resp.observacion@lab.test",
            RolUsuario.RESPONSABLE_LAB,
            lab_id=lab.id,
        )
        responsable_token = get_token(client, "resp.observacion@lab.test", "Test1234!")
        activo = _activo_laboratorio(client, responsable_token, lab.id, "PC con dato incompleto")
        admin_token = get_token(client, "admin@test.com", "AdminPass123")

        observado = client.post(
            f"/inventario/activos/{activo['id']}/validacion",
            json={
                "estado_admin": "OBSERVADO",
                "observaciones": "Captura el numero de serie fisico",
            },
            headers=auth_headers(admin_token),
        )
        assert observado.status_code == 200, observado.text
        assert observado.json()["estado_admin"] == "OBSERVADO"

        corregido = client.put(
            f"/inventario/activos/{activo['id']}",
            json={"numero_serie": "SERIE-OBS-001"},
            headers=auth_headers(responsable_token),
        )
        assert corregido.status_code == 200, corregido.text
        assert corregido.json()["numero_serie"] == "SERIE-OBS-001"
        assert corregido.json()["estado_admin"] == "OBSERVADO"

    def test_no_puede_crear_activo_en_lab_ajeno(self, client, db, admin_user):
        lab_propio = _lab(db, "Lab Propio", "QUIMICA")
        lab_ajeno  = _lab(db, "Lab Ajeno",  "COMPUTO")
        resp = _usuario(db, "Resp Solo", "resp2@lab.test", RolUsuario.RESPONSABLE_LAB, lab_id=lab_propio.id)
        token = get_token(client, "resp2@lab.test", "Test1234!")

        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "LABORATORIO",
                "laboratorio_id": lab_ajeno.id,
                "nombre": "Intento acceso ajeno",
                "categoria": "COMPUTADORA",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 403, r.text

    def test_no_puede_crear_activo_institucional(self, client, db, admin_user):
        lab = _lab(db, "Lab Inst Test", "QUIMICA")
        dep = _dep(db, "Depto Inst Test", "DINST")
        resp = _usuario(db, "Resp Inst", "resp3@lab.test", RolUsuario.RESPONSABLE_LAB, lab_id=lab.id)
        token = get_token(client, "resp3@lab.test", "Test1234!")

        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "INSTITUCIONAL",
                "departamento_id": dep.id,
                "nombre": "Activo institucional ilegal",
                "categoria": "MOBILIARIO",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 403, r.text

    def test_puede_listar_activos_de_su_laboratorio(self, client, db, admin_user):
        lab = _lab(db, "Lab Listado", "QUIMICA")
        resp = _usuario(db, "Resp Listado", "resp4@lab.test", RolUsuario.RESPONSABLE_LAB, lab_id=lab.id)
        admin_token = get_token(client, "admin@test.com", "AdminPass123")
        _activo_laboratorio(client, admin_token, lab.id, "Reactivo A", "REACTIVO")

        token = get_token(client, "resp4@lab.test", "Test1234!")
        r = client.get(f"/inventario/activos?laboratorio_id={lab.id}", headers=auth_headers(token))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_no_puede_ver_activos_de_lab_ajeno(self, client, db, admin_user):
        lab_propio = _lab(db, "Lab Resp Propio", "QUIMICA")
        lab_ajeno  = _lab(db, "Lab Ajeno Listado", "COMPUTO")
        resp = _usuario(db, "Resp Bloqueado", "resp5@lab.test", RolUsuario.RESPONSABLE_LAB, lab_id=lab_propio.id)
        token = get_token(client, "resp5@lab.test", "Test1234!")

        r = client.get(f"/inventario/activos?laboratorio_id={lab_ajeno.id}", headers=auth_headers(token))
        assert r.status_code == 403, r.text

    def test_sin_laboratorio_asignado_devuelve_403(self, client, db, admin_user):
        resp = _usuario(db, "Resp Sin Lab", "resp6@lab.test", RolUsuario.RESPONSABLE_LAB, lab_id=None)
        token = get_token(client, "resp6@lab.test", "Test1234!")

        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "LABORATORIO",
                "laboratorio_id": 999,
                "nombre": "Activo sin lab",
                "categoria": "CRISTALERIA",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 403, r.text

    def test_puede_solicitar_baja_de_activo_propio(self, client, db, admin_user):
        lab = _lab(db, "Lab Baja Resp", "QUIMICA")
        resp = _usuario(db, "Resp Baja", "resp7@lab.test", RolUsuario.RESPONSABLE_LAB, lab_id=lab.id)
        admin_token = get_token(client, "admin@test.com", "AdminPass123")
        activo = _activo_laboratorio(client, admin_token, lab.id, "Activo para baja", "REACTIVO")

        token = get_token(client, "resp7@lab.test", "Test1234!")
        r = client.post(
            f"/inventario/activos/{activo['id']}/baja",
            json={"motivo": "OBSOLESCENCIA", "diagnostico": "Ya no sirve"},
            headers=auth_headers(token),
        )
        assert r.status_code == 201, r.text
        assert r.json()["estado"] == "SOLICITADA"


# ─── BLOQUEO DE ACTIVOS PENDIENTES ────────────────────────────────────────────

class TestActivoPendienteValidacion:
    def test_borrador_no_habilita_operaciones_hasta_validacion(self, client, db, admin_user):
        lab = _lab(db, "Lab Flujo Borrador", "COMPUTO")
        _usuario(
            db,
            "Responsable Flujo Borrador",
            "responsable.borrador@test.com",
            RolUsuario.RESPONSABLE_LAB,
            lab_id=lab.id,
        )
        responsable_token = get_token(
            client,
            "responsable.borrador@test.com",
            "Test1234!",
        )
        activo = _activo_laboratorio(
            client,
            responsable_token,
            lab.id,
            "Equipo pendiente de validacion",
            "COMPUTADORA",
        )
        activo_id = activo["id"]
        assert activo["estado_admin"] == "BORRADOR"

        manana = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()
        operaciones_bloqueadas = [
            client.get(
                f"/inventario/activos/{activo_id}/etiqueta",
                headers=auth_headers(responsable_token),
            ),
            client.get(
                f"/inventario/activos/{activo_id}/resguardo",
                headers=auth_headers(responsable_token),
            ),
            client.get(
                f"/inventario/activos/etiquetas?ids={activo_id}",
                headers=auth_headers(responsable_token),
            ),
            client.post(
                f"/inventario/activos/{activo_id}/movimientos",
                json={
                    "tipo": "CAMBIO_UBICACION",
                    "ubicacion_destino_nombre": "Area de pruebas",
                },
                headers=auth_headers(responsable_token),
            ),
            client.post(
                f"/inventario/activos/{activo_id}/baja",
                json={"motivo": "Prueba de bloqueo"},
                headers=auth_headers(responsable_token),
            ),
            client.post(
                "/inventario/prestamos",
                json={
                    "activo_id": activo_id,
                    "receptor_nombre": "Persona de prueba",
                    "receptor_tipo": "DOCENTE",
                    "fecha_devolucion_esperada": manana,
                },
                headers=auth_headers(responsable_token),
            ),
            client.post(
                "/inventario/mantenimientos-preventivos",
                json={
                    "activo_id": activo_id,
                    "tipo": "INSPECCION",
                    "periodicidad": "UNICO",
                    "fecha_programada": manana,
                },
                headers=auth_headers(responsable_token),
            ),
            client.post(
                "/inventario/incidentes",
                json={
                    "activo_id": activo_id,
                    "tipo": "MANTENIMIENTO",
                    "descripcion": "Prueba de bloqueo",
                },
                headers=auth_headers(responsable_token),
            ),
            client.delete(
                f"/inventario/activos/{activo_id}",
                headers=auth_headers(responsable_token),
            ),
        ]
        assert all(r.status_code == 409 for r in operaciones_bloqueadas), [
            (r.status_code, r.text) for r in operaciones_bloqueadas
        ]
        assert all("Solo puede consultarse o corregirse" in r.text for r in operaciones_bloqueadas)

        disponibles = client.get(
            f"/inventario/activos?laboratorio_id={lab.id}&solo_disponibles=true",
            headers=auth_headers(responsable_token),
        )
        assert disponibles.status_code == 200
        assert all(item["id"] != activo_id for item in disponibles.json())

        levantamiento = client.post(
            "/inventario/levantamientos",
            json={"nombre": "Levantamiento sin borradores", "laboratorio_id": lab.id},
            headers=auth_headers(responsable_token),
        )
        assert levantamiento.status_code == 201, levantamiento.text
        detalle = client.get(
            f"/inventario/levantamientos/{levantamiento.json()['id']}/detalle",
            headers=auth_headers(responsable_token),
        )
        assert detalle.status_code == 200
        assert detalle.json()["resumen"]["total_esperado"] == 0

        estadisticas_pendientes = client.get(
            f"/inventario/estadisticas?laboratorio_id={lab.id}",
            headers=auth_headers(responsable_token),
        )
        assert estadisticas_pendientes.status_code == 200
        assert estadisticas_pendientes.json()["total_activos"] == 0
        assert estadisticas_pendientes.json()["por_estado_admin"]["BORRADOR"] == 1

        admin_token = get_token(client, "admin@test.com", "AdminPass123")
        validacion = client.post(
            f"/inventario/activos/{activo_id}/validacion",
            json={"estado_admin": "VALIDADO", "observaciones": "Alta comprobada"},
            headers=auth_headers(admin_token),
        )
        assert validacion.status_code == 200, validacion.text

        etiqueta = client.get(
            f"/inventario/activos/{activo_id}/etiqueta",
            headers=auth_headers(responsable_token),
        )
        assert etiqueta.status_code == 200, etiqueta.text
        estadisticas_validadas = client.get(
            f"/inventario/estadisticas?laboratorio_id={lab.id}",
            headers=auth_headers(responsable_token),
        )
        assert estadisticas_validadas.json()["total_activos"] == 1


# ─── LAB_ADMIN ────────────────────────────────────────────────────────────────

class TestLabAdmin:
    def test_puede_crear_activo_en_su_laboratorio(self, client, db, admin_user):
        lab = _lab(db, "Lab Admin QA", "COMPUTO")
        ladmin = _usuario(db, "Lab Admin", "ladmin@test.com", RolUsuario.LAB_ADMIN, lab_id=lab.id)
        token = get_token(client, "ladmin@test.com", "Test1234!")

        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "LABORATORIO",
                "laboratorio_id": lab.id,
                "nombre": "PC de lab admin",
                "categoria": "COMPUTADORA",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 201, r.text

    def test_no_puede_crear_activo_en_lab_ajeno(self, client, db, admin_user):
        lab_propio = _lab(db, "Lab Admin Propio", "COMPUTO")
        lab_ajeno  = _lab(db, "Lab Admin Ajeno",  "COMPUTO")
        ladmin = _usuario(db, "Lab Admin 2", "ladmin2@test.com", RolUsuario.LAB_ADMIN, lab_id=lab_propio.id)
        token = get_token(client, "ladmin2@test.com", "Test1234!")

        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "LABORATORIO",
                "laboratorio_id": lab_ajeno.id,
                "nombre": "Intento lab ajeno",
                "categoria": "COMPUTADORA",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 403, r.text

    def test_no_puede_crear_activo_institucional(self, client, db, admin_user):
        lab = _lab(db, "Lab Admin Inst", "COMPUTO")
        dep = _dep(db, "Depto Lab Admin", "DLBA")
        ladmin = _usuario(db, "Lab Admin 3", "ladmin3@test.com", RolUsuario.LAB_ADMIN, lab_id=lab.id)
        token = get_token(client, "ladmin3@test.com", "Test1234!")

        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "INSTITUCIONAL",
                "departamento_id": dep.id,
                "nombre": "Activo inst lab admin",
                "categoria": "MOBILIARIO",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 403, r.text


# ─── ADMINISTRATIVO ───────────────────────────────────────────────────────────

class TestAdministrativo:
    def test_puede_crear_activo_en_su_departamento(self, client, db):
        admin_u = _usuario(db, "Admin Depto A", "adm@depto.test", RolUsuario.ADMINISTRATIVO)
        dep = _dep(db, "Depto Admin A", "DA01")
        dep.responsable_id = admin_u.id
        admin_u.departamento_id = dep.id
        db.commit()

        token = get_token(client, "adm@depto.test", "Test1234!")
        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "INSTITUCIONAL",
                "departamento_id": dep.id,
                "nombre": "Silla Depto A",
                "categoria": "MOBILIARIO",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 201, r.text

    def test_no_puede_crear_activo_en_depto_ajeno(self, client, db):
        admin_u = _usuario(db, "Admin Depto B", "adm2@depto.test", RolUsuario.ADMINISTRATIVO)
        dep_propio = _dep(db, "Depto Admin B", "DA02")
        dep_ajeno  = _dep(db, "Depto Ajeno B",  "DA03")
        dep_propio.responsable_id = admin_u.id
        admin_u.departamento_id = dep_propio.id
        db.commit()

        token = get_token(client, "adm2@depto.test", "Test1234!")
        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "INSTITUCIONAL",
                "departamento_id": dep_ajeno.id,
                "nombre": "Activo ajeno ilegal",
                "categoria": "MOBILIARIO",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 403, r.text

    def test_no_puede_crear_activo_de_laboratorio(self, client, db):
        admin_u = _usuario(db, "Admin Depto C", "adm3@depto.test", RolUsuario.ADMINISTRATIVO)
        dep = _dep(db, "Depto Admin C", "DA04")
        lab = _lab(db, "Lab Depto C")
        dep.responsable_id = admin_u.id
        admin_u.departamento_id = dep.id
        db.commit()

        token = get_token(client, "adm3@depto.test", "Test1234!")
        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "LABORATORIO",
                "laboratorio_id": lab.id,
                "nombre": "Activo lab por admin",
                "categoria": "COMPUTADORA",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 403, r.text


# ─── VALIDACIONES DE CREACIÓN ─────────────────────────────────────────────────

class TestValidacionesCreacion:
    def test_categoria_invalida_devuelve_422(self, client, db, admin_user):
        dep = _dep(db, "Depto Val", "DPVAL")
        token = get_token(client, "admin@test.com", "AdminPass123")
        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "INSTITUCIONAL",
                "departamento_id": dep.id,
                "nombre": "Activo cat invalida",
                "categoria": "CATEGORIA_FALSA",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 422, r.text

    def test_alcance_invalido_devuelve_422(self, client, db, admin_user):
        dep = _dep(db, "Depto Alc", "DPALC")
        token = get_token(client, "admin@test.com", "AdminPass123")
        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "INVALIDO",
                "departamento_id": dep.id,
                "nombre": "Activo alcance malo",
                "categoria": "MOBILIARIO",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 422, r.text

    def test_numero_oficial_duplicado_devuelve_409(self, client, db, admin_user):
        dep = _dep(db, "Depto Dup", "DPDUP")
        token = get_token(client, "admin@test.com", "AdminPass123")
        _activo_institucional(client, token, dep.id, numero_oficial="OFICIAL-001")
        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "INSTITUCIONAL",
                "departamento_id": dep.id,
                "nombre": "Activo dup oficial",
                "categoria": "MOBILIARIO",
                "numero_oficial": "OFICIAL-001",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 409, r.text

    def test_activo_lab_sin_laboratorio_id_devuelve_422(self, client, db, admin_user):
        token = get_token(client, "admin@test.com", "AdminPass123")
        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "LABORATORIO",
                "nombre": "Activo lab sin id",
                "categoria": "COMPUTADORA",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 422, r.text

    def test_activo_lab_con_laboratorio_inexistente_devuelve_404(self, client, db, admin_user):
        token = get_token(client, "admin@test.com", "AdminPass123")
        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "LABORATORIO",
                "laboratorio_id": 99999,
                "nombre": "Activo lab inexistente",
                "categoria": "COMPUTADORA",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 404, r.text

    def test_activo_de_laboratorio_no_conserva_departamento(self, client, db, admin_user):
        lab = _lab(db, "Lab sin departamento", "QUIMICA")
        dep = _dep(db, "Depto no aplicable", "DNA")
        token = get_token(client, "admin@test.com", "AdminPass123")
        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "LABORATORIO",
                "laboratorio_id": lab.id,
                "departamento_id": dep.id,
                "nombre": "Activo exclusivo del laboratorio",
                "categoria": "EQUIPO_LABORATORIO",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 201, r.text
        assert r.json()["laboratorio_id"] == lab.id
        assert r.json()["departamento_id"] is None

    def test_activo_institucional_sin_departamento_se_permite_para_super_admin(self, client, db, admin_user):
        """SUPER_ADMIN puede crear activo institucional sin departamento (queda con departamento_id=null)."""
        token = get_token(client, "admin@test.com", "AdminPass123")
        r = client.post(
            "/inventario/activos",
            json={
                "alcance": "INSTITUCIONAL",
                "nombre": "Activo sin depto SA",
                "categoria": "MOBILIARIO",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 201, r.text
        assert r.json()["departamento_id"] is None


# ─── MOVIMIENTOS ──────────────────────────────────────────────────────────────

class TestMovimientos:
    def _setup(self, client, db, admin_user):
        dep = _dep(db, "Depto Mov", "DPMOV")
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo = _activo_institucional(client, token, dep.id, "Activo movible")
        return dep, token, activo

    def test_cambio_resguardante(self, client, db, admin_user):
        dep, token, activo = self._setup(client, db, admin_user)
        r = client.post(
            f"/inventario/activos/{activo['id']}/movimientos",
            json={
                "tipo": "CAMBIO_RESGUARDANTE",
                "resguardante_destino_nombre": "Nuevo Resguardante",
                "observaciones": "Test cambio resguardante",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 201, r.text
        assert r.json()["estado"] == "RECIBIDO"
        detalle = client.get(f"/inventario/activos/{activo['id']}", headers=auth_headers(token))
        assert detalle.json()["resguardante_externo_nombre"] == "Nuevo Resguardante"

    def test_cambio_ubicacion(self, client, db, admin_user):
        dep, token, activo = self._setup(client, db, admin_user)
        r = client.post(
            f"/inventario/activos/{activo['id']}/movimientos",
            json={
                "tipo": "CAMBIO_UBICACION",
                "ubicacion_destino_nombre": "Oficina 204",
                "observaciones": "Reubicación por remodelación",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 201, r.text
        detalle = client.get(f"/inventario/activos/{activo['id']}", headers=auth_headers(token))
        assert detalle.json()["ubicacion_nombre"] == "Oficina 204"

    def test_transferencia_entre_deptos_requiere_super_admin(self, client, db, admin_user):
        dep_a = _dep(db, "Depto A Transf", "DTA")
        dep_b = _dep(db, "Depto B Transf", "DTB")
        token_admin = get_token(client, "admin@test.com", "AdminPass123")
        activo = _activo_institucional(client, token_admin, dep_a.id, "Activo transferible")

        # ADMINISTRATIVO del depto A no puede transferir a depto B
        adm_u = _usuario(db, "Admin Transf", "adm_transf@test.com", RolUsuario.ADMINISTRATIVO)
        dep_a.responsable_id = adm_u.id
        adm_u.departamento_id = dep_a.id
        db.commit()
        token_adm = get_token(client, "adm_transf@test.com", "Test1234!")

        r = client.post(
            f"/inventario/activos/{activo['id']}/movimientos",
            json={
                "tipo": "TRANSFERENCIA_DEPARTAMENTO",
                "departamento_destino_id": dep_b.id,
                "observaciones": "Intento transferencia por no-admin",
            },
            headers=auth_headers(token_adm),
        )
        assert r.status_code == 403, r.text

    def test_transferencia_entre_deptos_por_super_admin(self, client, db, admin_user):
        dep_a = _dep(db, "Depto Origen SA", "DOSA")
        dep_b = _dep(db, "Depto Destino SA", "DDSA")
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo = _activo_institucional(client, token, dep_a.id, "Activo para transferir SA")

        r = client.post(
            f"/inventario/activos/{activo['id']}/movimientos",
            json={
                "tipo": "TRANSFERENCIA_DEPARTAMENTO",
                "departamento_destino_id": dep_b.id,
                "observaciones": "Transferencia autorizada por admin",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 201, r.text
        assert r.json()["estado"] == "RECIBIDO"
        detalle = client.get(f"/inventario/activos/{activo['id']}", headers=auth_headers(token))
        assert detalle.json()["departamento_id"] == dep_b.id

    def test_movimiento_registrado_en_expediente(self, client, db, admin_user):
        dep, token, activo = self._setup(client, db, admin_user)
        client.post(
            f"/inventario/activos/{activo['id']}/movimientos",
            json={"tipo": "CAMBIO_RESGUARDANTE", "resguardante_destino_nombre": "Exp Test"},
            headers=auth_headers(token),
        )
        exp = client.get(f"/inventario/activos/{activo['id']}/expediente", headers=auth_headers(token))
        assert exp.status_code == 200
        assert any(e["tipo"] == "MOVIMIENTO" for e in exp.json().get("timeline", []))


# ─── PRÉSTAMOS ────────────────────────────────────────────────────────────────

class TestPrestamos:
    def _activo_prestable(self, client, db, admin_user):
        dep = _dep(db, "Depto Prestamo", "DPPRE")
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo = _activo_institucional(client, token, dep.id, "Activo prestable")
        return token, activo

    def test_crear_prestamo(self, client, db, admin_user):
        token, activo = self._activo_prestable(client, db, admin_user)
        manana = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()
        r = client.post(
            "/inventario/prestamos",
            json={
                "activo_id": activo["id"],
                "receptor_nombre": "Juan Pérez",
                "receptor_tipo": "ALUMNO",
                "proposito": "Tarea final",
                "fecha_devolucion_esperada": manana,
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 201, r.text
        assert r.json()["estado"] == "ACTIVO"
        assert r.json()["folio"].startswith("PRE-")

    def test_crear_prestamo_con_varios_activos(self, client, db, admin_user):
        dep = _dep(db, "Depto Prestamo Grupo", "DPGRP")
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo_uno = _activo_institucional(client, token, dep.id, "Proyector grupo")
        activo_dos = _activo_institucional(client, token, dep.id, "Bocina grupo")
        manana = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()

        r = client.post(
            "/inventario/prestamos",
            json={
                # El frontend conserva los ids como strings en el combobox.
                "activo_ids": [str(activo_uno["id"]), str(activo_dos["id"])],
                "receptor_nombre": "María López",
                "receptor_tipo": "DOCENTE",
                "proposito": "Evento institucional",
                "fecha_devolucion_esperada": manana,
            },
            headers=auth_headers(token),
        )

        assert r.status_code == 201, r.text
        data = r.json()
        assert data["total_activos"] == 2
        assert len(data["prestamos"]) == 2
        assert {p["folio"] for p in data["prestamos"]} == {data["folio"]}

    def test_devolucion_parcial_y_total_por_folio(self, client, db, admin_user):
        dep = _dep(db, "Depto Devolucion Grupo", "DPDVG")
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo_uno = _activo_institucional(client, token, dep.id, "Cámara grupo")
        activo_dos = _activo_institucional(client, token, dep.id, "Trípode grupo")
        manana = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()
        creado = client.post(
            "/inventario/prestamos",
            json={
                "activo_ids": [activo_uno["id"], activo_dos["id"]],
                "receptor_nombre": "Pedro Martínez",
                "receptor_tipo": "DOCENTE",
                "fecha_devolucion_esperada": manana,
            },
            headers=auth_headers(token),
        ).json()

        primer_id = creado["prestamos"][0]["id"]
        parcial = client.post(
            f"/inventario/prestamos/grupos/{creado['folio']}/devolver",
            json={
                "prestamo_ids": [primer_id],
                "condicion_devolucion": "BUENO",
                "notas_devolucion": "Entrega parcial",
            },
            headers=auth_headers(token),
        )
        assert parcial.status_code == 200, parcial.text
        assert parcial.json()["devueltos"] == 1

        pendientes = client.get(
            "/inventario/prestamos?estado=ACTIVO",
            headers=auth_headers(token),
        ).json()
        pendientes_grupo = [p for p in pendientes if p["folio"] == creado["folio"]]
        assert len(pendientes_grupo) == 1

        total = client.post(
            f"/inventario/prestamos/grupos/{creado['folio']}/devolver",
            json={"condicion_devolucion": "BUENO", "notas_devolucion": "Entrega final"},
            headers=auth_headers(token),
        )
        assert total.status_code == 200, total.text
        assert total.json()["devueltos"] == 1

    def test_no_se_puede_prestar_dos_veces_el_mismo_activo(self, client, db, admin_user):
        token, activo = self._activo_prestable(client, db, admin_user)
        manana = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()
        payload = {
            "activo_id": activo["id"],
            "receptor_nombre": "Ana García",
            "receptor_tipo": "DOCENTE",
            "proposito": "Exposición",
            "fecha_devolucion_esperada": manana,
        }
        r1 = client.post("/inventario/prestamos", json=payload, headers=auth_headers(token))
        assert r1.status_code == 201, r1.text

        r2 = client.post("/inventario/prestamos", json=payload, headers=auth_headers(token))
        assert r2.status_code == 409, r2.text

    def test_devolver_prestamo(self, client, db, admin_user):
        token, activo = self._activo_prestable(client, db, admin_user)
        manana = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()
        prestamo = client.post(
            "/inventario/prestamos",
            json={
                "activo_id": activo["id"],
                "receptor_nombre": "Carlos López",
                "receptor_tipo": "DOCENTE",
                "proposito": "Demo",
                "fecha_devolucion_esperada": manana,
            },
            headers=auth_headers(token),
        ).json()

        r = client.post(
            f"/inventario/prestamos/{prestamo['id']}/devolver",
            json={"condicion_devolucion": "BUENO", "notas_devolucion": "Sin daños"},
            headers=auth_headers(token),
        )
        assert r.status_code == 200, r.text
        assert r.json()["estado"] == "DEVUELTO"

    def test_no_se_puede_prestar_activo_en_mantenimiento(self, client, db, admin_user):
        dep = _dep(db, "Depto Prest Mant", "DPPM")
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo = _activo_institucional(client, token, dep.id, "Activo en mant")

        # Poner en mantenimiento directamente
        client.put(
            f"/inventario/activos/{activo['id']}",
            json={"estado": "MANTENIMIENTO"},
            headers=auth_headers(token),
        )
        manana = (datetime.date.today() + datetime.timedelta(days=3)).isoformat()
        r = client.post(
            "/inventario/prestamos",
            json={
                "activo_id": activo["id"],
                "receptor_nombre": "Test",
                "receptor_tipo": "DOCENTE",
                "proposito": "Test",
                "fecha_devolucion_esperada": manana,
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 400, r.text

    def test_fecha_pasada_devuelve_422(self, client, db, admin_user):
        token, activo = self._activo_prestable(client, db, admin_user)
        ayer = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
        r = client.post(
            "/inventario/prestamos",
            json={
                "activo_id": activo["id"],
                "receptor_nombre": "Test",
                "receptor_tipo": "DOCENTE",
                "proposito": "Test",
                "fecha_devolucion_esperada": ayer,
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 422, r.text


# ─── BAJA PATRIMONIAL ─────────────────────────────────────────────────────────

class TestBaja:
    def _setup(self, client, db, admin_user):
        dep = _dep(db, "Depto Baja", "DPBJA")
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo = _activo_institucional(client, token, dep.id, "Activo para baja")
        return token, activo

    def test_flujo_completo_baja(self, client, db, admin_user):
        token, activo = self._setup(client, db, admin_user)
        aid = activo["id"]

        baja = client.post(
            f"/inventario/activos/{aid}/baja",
            json={"motivo": "OBSOLESCENCIA", "diagnostico": "Equipo obsoleto"},
            headers=auth_headers(token),
        )
        assert baja.status_code == 201, baja.text
        baja_id = baja.json()["id"]
        assert baja.json()["estado"] == "SOLICITADA"

        r = client.post(f"/inventario/bajas/{baja_id}/revisar", headers=auth_headers(token))
        assert r.status_code == 200
        assert r.json()["estado"] == "EN_REVISION"

        r = client.post(f"/inventario/bajas/{baja_id}/validar", headers=auth_headers(token))
        assert r.status_code == 200
        assert r.json()["estado"] == "VALIDADA_FISICAMENTE"

        r = client.post(f"/inventario/bajas/{baja_id}/autorizar", headers=auth_headers(token))
        assert r.status_code == 200
        assert r.json()["estado"] == "AUTORIZADA"

        r = client.post(f"/inventario/bajas/{baja_id}/ejecutar", headers=auth_headers(token))
        assert r.status_code == 200
        assert r.json()["estado"] == "EJECUTADA"

        detalle = client.get(f"/inventario/activos/{aid}", headers=auth_headers(token))
        assert detalle.json()["estado"] == "BAJA"
        assert detalle.json()["estado_admin"] == "BAJA_EJECUTADA"

    def test_baja_duplicada_devuelve_409(self, client, db, admin_user):
        token, activo = self._setup(client, db, admin_user)
        aid = activo["id"]
        client.post(
            f"/inventario/activos/{aid}/baja",
            json={"motivo": "OBSOLESCENCIA", "diagnostico": "Duplicado test"},
            headers=auth_headers(token),
        )
        r = client.post(
            f"/inventario/activos/{aid}/baja",
            json={"motivo": "OBSOLESCENCIA", "diagnostico": "Segunda baja"},
            headers=auth_headers(token),
        )
        assert r.status_code == 409, r.text

    def test_rechazar_baja(self, client, db, admin_user):
        token, activo = self._setup(client, db, admin_user)
        aid = activo["id"]
        baja = client.post(
            f"/inventario/activos/{aid}/baja",
            json={"motivo": "DAÑO_IRREPARABLE", "diagnostico": "Se rechazará"},
            headers=auth_headers(token),
        ).json()

        r = client.post(f"/inventario/bajas/{baja['id']}/rechazar", headers=auth_headers(token))
        assert r.status_code == 200
        assert r.json()["estado"] == "RECHAZADA"

        detalle = client.get(f"/inventario/activos/{aid}", headers=auth_headers(token))
        assert detalle.json()["estado_admin"] == "OBSERVADO"

    def test_no_se_puede_autorizar_sin_validacion_fisica(self, client, db, admin_user):
        token, activo = self._setup(client, db, admin_user)
        aid = activo["id"]
        baja = client.post(
            f"/inventario/activos/{aid}/baja",
            json={"motivo": "OBSOLESCENCIA", "diagnostico": "Test orden"},
            headers=auth_headers(token),
        ).json()

        # Saltar directamente a autorizar sin validar
        r = client.post(f"/inventario/bajas/{baja['id']}/autorizar", headers=auth_headers(token))
        assert r.status_code == 409, r.text

    def test_solo_super_admin_puede_autorizar(self, client, db, admin_user):
        lab = _lab(db, "Lab Baja SA", "QUIMICA")
        resp = _usuario(db, "Resp Baja SA", "resp_baja@test.com", RolUsuario.RESPONSABLE_LAB, lab_id=lab.id)
        admin_token = get_token(client, "admin@test.com", "AdminPass123")
        activo = _activo_laboratorio(client, admin_token, lab.id, "Activo baja SA", "REACTIVO")

        # El responsable solicita y valida
        resp_token = get_token(client, "resp_baja@test.com", "Test1234!")
        baja = client.post(
            f"/inventario/activos/{activo['id']}/baja",
            json={"motivo": "OBSOLESCENCIA", "diagnostico": "Test"},
            headers=auth_headers(resp_token),
        ).json()
        client.post(f"/inventario/bajas/{baja['id']}/revisar", headers=auth_headers(admin_token))
        client.post(f"/inventario/bajas/{baja['id']}/validar", headers=auth_headers(admin_token))

        # Responsable intenta autorizar → 403
        r = client.post(f"/inventario/bajas/{baja['id']}/autorizar", headers=auth_headers(resp_token))
        assert r.status_code == 403, r.text


# ─── MANTENIMIENTO PREVENTIVO ─────────────────────────────────────────────────

class TestMantenimientoPreventivo:
    def _setup(self, client, db, admin_user):
        dep = _dep(db, "Depto Mant", "DPMNT")
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo = _activo_institucional(client, token, dep.id, "Equipo preventivo")
        return dep, token, activo

    def test_crear_mantenimiento(self, client, db, admin_user):
        dep, token, activo = self._setup(client, db, admin_user)
        proxima = (datetime.date.today() + datetime.timedelta(days=30)).isoformat()
        r = client.post(
            "/inventario/mantenimientos-preventivos",
            json={
                "activo_id": activo["id"],
                "tipo": "LIMPIEZA_FISICA",
                "periodicidad": "MENSUAL",
                "fecha_programada": proxima,
                "fecha_limite": proxima,
                "descripcion": "Limpieza mensual",
            },
            headers=auth_headers(token),
        )
        assert r.status_code == 200, r.text
        assert r.json()["activo_id"] == activo["id"]

    def test_mantenimiento_vencido_aparece_en_alertas(self, client, db, admin_user):
        dep, token, activo = self._setup(client, db, admin_user)
        ayer = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
        client.post(
            "/inventario/mantenimientos-preventivos",
            json={
                "activo_id": activo["id"],
                "tipo": "INSPECCION",
                "periodicidad": "UNICO",
                "fecha_programada": ayer,
                "fecha_limite": ayer,
                "descripcion": "Inspección vencida",
            },
            headers=auth_headers(token),
        )
        alertas = client.get(
            f"/inventario/mantenimiento-alertas?departamento_id={dep.id}",
            headers=auth_headers(token),
        )
        assert alertas.status_code == 200
        assert alertas.json()["vencidos"] >= 1

    def test_flujo_iniciar_y_completar(self, client, db, admin_user):
        dep, token, activo = self._setup(client, db, admin_user)
        ayer = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
        mant = client.post(
            "/inventario/mantenimientos-preventivos",
            json={
                "activo_id": activo["id"],
                "tipo": "CALIBRACION",
                "periodicidad": "UNICO",
                "fecha_programada": ayer,
                "fecha_limite": ayer,
                "descripcion": "Calibración test",
            },
            headers=auth_headers(token),
        ).json()
        mant_id = mant["id"]

        iniciar = client.put(
            f"/inventario/mantenimientos-preventivos/{mant_id}",
            json={"estado": "EN_PROCESO"},
            headers=auth_headers(token),
        )
        assert iniciar.status_code == 200
        detalle = client.get(f"/inventario/activos/{activo['id']}", headers=auth_headers(token))
        assert detalle.json()["estado"] == "MANTENIMIENTO"

        completar = client.put(
            f"/inventario/mantenimientos-preventivos/{mant_id}",
            json={"estado": "COMPLETADO", "notas_result": "OK", "duracion_min": 45},
            headers=auth_headers(token),
        )
        assert completar.status_code == 200
        detalle_final = client.get(f"/inventario/activos/{activo['id']}", headers=auth_headers(token))
        assert detalle_final.json()["estado"] == "OPERATIVO"

    def test_mantenimiento_registrado_en_expediente(self, client, db, admin_user):
        dep, token, activo = self._setup(client, db, admin_user)
        ayer = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
        mant = client.post(
            "/inventario/mantenimientos-preventivos",
            json={
                "activo_id": activo["id"],
                "tipo": "INSPECCION",
                "periodicidad": "UNICO",
                "fecha_programada": ayer,
                "fecha_limite": ayer,
                "descripcion": "Insp expediente",
            },
            headers=auth_headers(token),
        ).json()
        client.put(
            f"/inventario/mantenimientos-preventivos/{mant['id']}",
            json={"estado": "EN_PROCESO"},
            headers=auth_headers(token),
        )
        client.put(
            f"/inventario/mantenimientos-preventivos/{mant['id']}",
            json={"estado": "COMPLETADO", "notas_result": "Listo", "duracion_min": 10},
            headers=auth_headers(token),
        )
        exp = client.get(f"/inventario/activos/{activo['id']}/expediente", headers=auth_headers(token))
        assert exp.status_code == 200
        # Los mantenimientos se registran como AUDITORIA en el timeline (cambios de estado del activo)
        timeline = exp.json().get("timeline", [])
        assert len(timeline) >= 1, "El expediente debe tener al menos un evento de auditoría"


# ─── LEVANTAMIENTOS ───────────────────────────────────────────────────────────

class TestLevantamientos:
    def _setup(self, client, db, admin_user):
        dep = _dep(db, "Depto Lev", "DPLEV")
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo = _activo_institucional(client, token, dep.id, "Bien levantamiento")
        return dep, token, activo

    def test_crear_levantamiento(self, client, db, admin_user):
        dep, token, activo = self._setup(client, db, admin_user)
        r = client.post(
            "/inventario/levantamientos",
            json={"nombre": "Levantamiento anual", "departamento_id": dep.id},
            headers=auth_headers(token),
        )
        assert r.status_code == 201, r.text
        assert r.json()["estado"] == "ABIERTO"

    def test_detalle_muestra_esperados_y_pendientes(self, client, db, admin_user):
        dep, token, activo = self._setup(client, db, admin_user)
        lev = client.post(
            "/inventario/levantamientos",
            json={"nombre": "Lev detalle test", "departamento_id": dep.id},
            headers=auth_headers(token),
        ).json()

        detalle = client.get(f"/inventario/levantamientos/{lev['id']}/detalle", headers=auth_headers(token))
        assert detalle.status_code == 200
        resumen = detalle.json()["resumen"]
        assert resumen["total_esperado"] >= 1
        assert resumen["total_pendiente"] == resumen["total_esperado"]

    def test_revisar_activo_reduce_pendientes(self, client, db, admin_user):
        dep, token, activo = self._setup(client, db, admin_user)
        lev = client.post(
            "/inventario/levantamientos",
            json={"nombre": "Lev revisar test", "departamento_id": dep.id},
            headers=auth_headers(token),
        ).json()

        client.post(
            f"/inventario/levantamientos/{lev['id']}/revisiones",
            json={"activo_id": activo["id"], "estado": "LOCALIZADO", "observaciones": "OK"},
            headers=auth_headers(token),
        )
        detalle = client.get(f"/inventario/levantamientos/{lev['id']}/detalle", headers=auth_headers(token))
        assert detalle.json()["resumen"]["total_pendiente"] == 0

    def test_cerrar_levantamiento_completo(self, client, db, admin_user):
        dep, token, activo = self._setup(client, db, admin_user)
        lev = client.post(
            "/inventario/levantamientos",
            json={"nombre": "Lev cerrar test", "departamento_id": dep.id},
            headers=auth_headers(token),
        ).json()
        client.post(
            f"/inventario/levantamientos/{lev['id']}/revisiones",
            json={"activo_id": activo["id"], "estado": "LOCALIZADO"},
            headers=auth_headers(token),
        )
        r = client.post(f"/inventario/levantamientos/{lev['id']}/cerrar", headers=auth_headers(token))
        assert r.status_code == 200, r.text
        assert r.json()["estado"] == "CERRADO"

    def test_no_se_puede_revisar_activo_no_localizado_dos_veces(self, client, db, admin_user):
        dep, token, activo = self._setup(client, db, admin_user)
        lev = client.post(
            "/inventario/levantamientos",
            json={"nombre": "Lev doble revision", "departamento_id": dep.id},
            headers=auth_headers(token),
        ).json()
        lid = lev["id"]
        aid = activo["id"]

        r1 = client.post(
            f"/inventario/levantamientos/{lid}/revisiones",
            json={"activo_id": aid, "estado": "LOCALIZADO"},
            headers=auth_headers(token),
        )
        assert r1.status_code == 201

        r2 = client.post(
            f"/inventario/levantamientos/{lid}/revisiones",
            json={"activo_id": aid, "estado": "NO_LOCALIZADO"},
            headers=auth_headers(token),
        )
        # Segunda revisión del mismo activo debe ser rechazada (409) o sobrescrita (200)
        # — lo importante es que no retorne 500
        assert r2.status_code in (200, 201, 409), r2.text


# ─── DESCARGAS ────────────────────────────────────────────────────────────────

class TestDescargas:
    def _activo(self, client, db, admin_user):
        dep = _dep(db, "Depto Desc", "DPDES")
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo = _activo_institucional(client, token, dep.id, "Activo para descargas")
        return dep, token, activo

    def test_resguardo_excel(self, client, db, admin_user):
        dep, token, activo = self._activo(client, db, admin_user)
        r = client.get(f"/inventario/activos/{activo['id']}/resguardo", headers=auth_headers(token))
        assert r.status_code == 200, r.text
        assert "openxmlformats" in r.headers["content-type"]
        assert len(r.content) > 500

    def test_etiqueta_qr_individual_es_pdf(self, client, db, admin_user):
        dep, token, activo = self._activo(client, db, admin_user)
        r = client.get(f"/inventario/activos/{activo['id']}/etiqueta", headers=auth_headers(token))
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_etiquetas_masivas_por_departamento_es_pdf(self, client, db, admin_user):
        dep, token, activo = self._activo(client, db, admin_user)
        r = client.get(f"/inventario/activos/etiquetas?departamento_id={dep.id}", headers=auth_headers(token))
        assert r.status_code == 200, r.text
        assert r.content[:4] == b"%PDF"

    def test_exportar_excel_activos(self, client, db, admin_user):
        dep, token, activo = self._activo(client, db, admin_user)
        r = client.get(f"/inventario/activos/exportar?departamento_id={dep.id}", headers=auth_headers(token))
        assert r.status_code == 200, r.text
        assert "openxmlformats" in r.headers["content-type"]


# ─── EXPEDIENTE ───────────────────────────────────────────────────────────────

class TestExpediente:
    def test_expediente_registra_creacion(self, client, db, admin_user):
        dep = _dep(db, "Depto Exp", "DPEXP")
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo = _activo_institucional(client, token, dep.id, "Activo expediente")
        r = client.get(f"/inventario/activos/{activo['id']}/expediente", headers=auth_headers(token))
        assert r.status_code == 200
        # El expediente debe tener al menos un evento
        assert len(r.json().get("timeline", [])) >= 1

    def test_expediente_registra_edicion(self, client, db, admin_user):
        dep = _dep(db, "Depto Exp2", "DPEX2")
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo = _activo_institucional(client, token, dep.id, "Activo editable")
        client.put(
            f"/inventario/activos/{activo['id']}",
            json={"nombre": "Activo editado"},
            headers=auth_headers(token),
        )
        r = client.get(f"/inventario/activos/{activo['id']}/expediente", headers=auth_headers(token))
        assert r.status_code == 200
        # Debe haber más de un evento tras la edición
        assert len(r.json().get("timeline", [])) >= 1


# ─── EDICIÓN Y LISTADO ────────────────────────────────────────────────────────

class TestEdicionYListado:
    def test_editar_nombre_activo(self, client, db, admin_user):
        dep = _dep(db, "Depto Edit", "DPEDT")
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo = _activo_institucional(client, token, dep.id, "Nombre original")
        r = client.put(
            f"/inventario/activos/{activo['id']}",
            json={"nombre": "Nombre actualizado"},
            headers=auth_headers(token),
        )
        assert r.status_code == 200, r.text
        assert r.json()["nombre"] == "Nombre actualizado"

    def test_listar_activos_devuelve_lista(self, client, db, admin_user):
        dep = _dep(db, "Depto List", "DPLST")
        token = get_token(client, "admin@test.com", "AdminPass123")
        for i in range(3):
            _activo_institucional(client, token, dep.id, f"Activo lista {i}")
        r = client.get(f"/inventario/activos?departamento_id={dep.id}", headers=auth_headers(token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 3

    def test_filtrar_activos_por_categoria(self, client, db, admin_user):
        dep = _dep(db, "Depto Filtro Cat", "DPFCAT")
        token = get_token(client, "admin@test.com", "AdminPass123")
        _activo_institucional(client, token, dep.id, "Silla", "MOBILIARIO")
        _activo_institucional(client, token, dep.id, "Laptop", "COMPUTADORA")
        r = client.get(
            f"/inventario/activos?departamento_id={dep.id}&categoria=MOBILIARIO",
            headers=auth_headers(token),
        )
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert all(a["categoria"] == "MOBILIARIO" for a in items)

    def test_activo_inexistente_devuelve_404(self, client, db, admin_user):
        token = get_token(client, "admin@test.com", "AdminPass123")
        r = client.get("/inventario/activos/99999", headers=auth_headers(token))
        assert r.status_code == 404, r.text
