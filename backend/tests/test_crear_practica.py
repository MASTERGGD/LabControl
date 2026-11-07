import datetime
import pytest
from unittest.mock import Mock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import get_db
from dependencies import get_current_user
from models.horario import HorarioDisponible, Reservacion
from models.catalogo import PeriodoEscolar, GrupoAcademico
from models.docencia import CargaDocente
from models.usuario import Usuario, RolUsuario
from models.notificacion import Notificacion
from models.practica_laboratorio import PracticaLaboratorio, MaterialPractica
from routers.practicas_laboratorio import router


@pytest.mark.parametrize('fallo_respuesta', [False, True])
def test_crear_practica_con_material_notifica_responsable(db, lab, docente_user, monkeypatch, fallo_respuesta):
    lab.categoria = 'QUIMICA'
    responsable = Usuario(nombre='Responsable ficticio', email='responsable@example.test', password_hash='test', rol=RolUsuario.RESPONSABLE_LAB, laboratorio_id=lab.id, activo=True)
    periodo = PeriodoEscolar(clave='SEP-DIC 2099', activo=True, es_actual=True)
    db.add_all([responsable, periodo]); db.flush()
    horario = HorarioDisponible(laboratorio_id=lab.id, dia_semana=2, hora_inicio='08:00', hora_fin='09:00', cuatrimestre='SEP-DIC-2099')
    db.add(horario); db.flush()
    grupo = GrupoAcademico(periodo_id=periodo.id, carrera='Carrera ficticia', cuatrimestre=1, grupo='A', activo=True)
    db.add(grupo); db.flush()
    carga = CargaDocente(docente_id=docente_user.id, periodo_id=periodo.id, grupo_academico_id=grupo.id, actividad_nombre='Materia ficticia', tipo_actividad='CLASE', dia_semana=2, hora_inicio='08:00', hora_fin='09:00', estado='ACTIVO', activo=True)
    db.add(carga); db.flush()
    reserva = Reservacion(carga_docente_id=carga.id, horario_id=horario.id, laboratorio_id=lab.id, docente_id=docente_user.id, creado_por=docente_user.id, periodo_id=periodo.id, materia='Materia ficticia', cuatrimestre='SEP-DIC-2099', grupo='A', fecha_actividad=datetime.date(2099, 11, 18))
    # Fecha de miércoles equivalente a la solicitud reportada.
    fecha = datetime.date(2099, 11, 4)
    reserva.fecha_actividad = fecha
    db.add(reserva); db.commit()
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: docente_user
    commit = Mock(wraps=db.commit)
    monkeypatch.setattr(db, 'commit', commit)
    if fallo_respuesta:
        import routers.practicas_laboratorio as practicas
        def serializacion_fallida(*args):
            raise RuntimeError('Fallo ficticio de serialización')
        monkeypatch.setattr(practicas, '_serialize', serializacion_fallida)
    with TestClient(app, raise_server_exceptions=not fallo_respuesta) as client:
        respuesta = client.post('/practicas-laboratorio', json={'reservacion_id': reserva.id, 'fecha_sesion': fecha.isoformat(), 'titulo': 'Práctica ficticia', 'materiales': [{'descripcion': 'Material libre', 'cantidad_solicitada': 1, 'unidad': 'PIEZA', 'nota': 'Pendiente de confirmar'}]})
    if fallo_respuesta:
        assert respuesta.status_code == 500
        commit.assert_not_called()
        db.rollback()
        assert db.query(PracticaLaboratorio).count() == 0
        assert db.query(MaterialPractica).count() == 0
        assert db.query(Notificacion).count() == 0
        return
    assert respuesta.status_code == 201, respuesta.text
    assert db.query(Notificacion).filter_by(usuario_id=responsable.id, tipo='PRACTICA_LABORATORIO').count() == 1
    assert db.query(PracticaLaboratorio).count() == 1
    assert db.query(MaterialPractica).one().nota == 'Pendiente de confirmar'
