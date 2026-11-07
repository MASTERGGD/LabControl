"""Catálogo de materiales: sólo datos ficticios y base aislada de conftest."""
import datetime
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from database import get_db
from dependencies import get_current_user
from models.laboratorio import Laboratorio
from models.inventario import Activo, Prestamo
from models.practica_laboratorio import InsumoLaboratorio
from models.usuario import RolUsuario
from routers.practicas_laboratorio import catalogo_materiales, router
from services.timezone import now_mx


@pytest.fixture
def catalogo(db, lab, admin_user):
    lab.categoria = 'QUIMICA'
    otro = Laboratorio(nombre='Otro laboratorio', categoria='QUIMICA', activo=True)
    db.add(otro); db.flush()
    hoy = now_mx().date()
    db.add_all([
        InsumoLaboratorio(laboratorio_id=lab.id, nombre='Alcohol', categoria='REACTIVO', unidad='ml', cantidad_disponible=6),
        InsumoLaboratorio(laboratorio_id=lab.id, nombre='Caducado', categoria='REACTIVO', cantidad_disponible=8, caduca_en=hoy-datetime.timedelta(days=1)),
        InsumoLaboratorio(laboratorio_id=lab.id, nombre='Sin stock', cantidad_disponible=0),
        InsumoLaboratorio(laboratorio_id=lab.id, nombre='Inactivo', activo=False, cantidad_disponible=10),
        InsumoLaboratorio(laboratorio_id=otro.id, nombre='Ajeno', cantidad_disponible=10),
    ])
    for codigo, nombre, estado, admin, activo, laboratorio in [
        ('EQ-1', 'Balanza', 'OPERATIVO', 'VALIDADO', True, lab.id),
        ('EQ-2', 'Equipo en reparación', 'MANTENIMIENTO', 'VALIDADO', True, lab.id),
        ('EQ-3', 'Borrador privado', 'OPERATIVO', 'BORRADOR', True, lab.id),
        ('EQ-4', 'Baja', 'OPERATIVO', 'VALIDADO', False, lab.id),
        ('EQ-5', 'Equipo ajeno', 'OPERATIVO', 'VALIDADO', True, otro.id),
        ('EQ-6', 'Equipo prestado', 'OPERATIVO', 'VALIDADO', True, lab.id),
    ]:
        db.add(Activo(laboratorio_id=laboratorio, codigo_inventario=codigo, nombre=nombre,
            categoria='EQUIPO_LABORATORIO', estado=estado, estado_admin=admin, activo=activo,
            valor=99999, numero_serie='PRIVADO', observaciones='PRIVADO'))
    db.flush()
    equipo = db.query(Activo).filter_by(codigo_inventario='EQ-6').one()
    db.add(Prestamo(activo_id=equipo.id, solicitante_nombre='Ficticio', solicitante_id_escolar='TEST',
        autorizado_por=admin_user.id, estado='VENCIDO', fecha_retorno_esperada=hoy))
    db.commit()
    return otro


def test_catalogo_incluye_solo_laboratorio_sin_datos_privados(db, lab, docente_user, catalogo):
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: docente_user
    with TestClient(app) as client:
        response = client.get('/practicas-laboratorio/catalogo-materiales', params={'laboratorio_id': lab.id})
    assert response.status_code == 200
    items = {x['nombre']: x for x in response.json()}
    assert set(items) == {'Alcohol', 'Caducado', 'Sin stock', 'Balanza', 'Equipo en reparación', 'Equipo prestado'}
    assert items['Alcohol']['disponible'] == 6
    assert items['Balanza']['tipo'] == 'EQUIPO'
    assert items['Balanza']['codigo'] == 'EQ-1'
    assert 'PRIVADO' not in response.text and '99999' not in response.text


def test_catalogo_no_ofrece_caducados_mantenimiento_ni_prestados_como_disponibles(db, lab, docente_user, catalogo):
    items = {x['nombre']: x for x in catalogo_materiales(lab.id, db, docente_user)}
    for nombre in ['Caducado', 'Sin stock', 'Equipo en reparación', 'Equipo prestado']:
        assert items[nombre]['disponible'] == 0
    assert items['Caducado']['existencia'] == 8
    assert items['Equipo prestado']['estado'] == 'En préstamo'


@pytest.mark.parametrize('rol', [RolUsuario.ALUMNO, RolUsuario.LAB_ADMIN])
def test_catalogo_respeta_rol_y_laboratorio_asignado(db, lab, docente_user, catalogo, rol):
    docente_user.rol = rol; docente_user.laboratorio_id = catalogo.id
    with pytest.raises(HTTPException) as exc:
        catalogo_materiales(lab.id, db, docente_user)
    assert exc.value.status_code == 403


def test_catalogo_rechaza_computo(db, lab, docente_user):
    lab.categoria = 'COMPUTO'; db.commit()
    with pytest.raises(HTTPException) as exc:
        catalogo_materiales(lab.id, db, docente_user)
    assert exc.value.status_code == 400


def test_catalogo_requiere_autenticacion(db, lab):
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        response = client.get('/practicas-laboratorio/catalogo-materiales', params={'laboratorio_id': lab.id})
    assert response.status_code in (401, 403)


def test_consultar_no_aparta_ni_descuenta_existencias(db, lab, docente_user, catalogo):
    antes = [(i.id, i.cantidad_disponible) for i in db.query(InsumoLaboratorio).all()]
    catalogo_materiales(lab.id, db, docente_user)
    db.expire_all()
    assert [(i.id, i.cantidad_disponible) for i in db.query(InsumoLaboratorio).all()] == antes
