import datetime

from models.catalogo import CatalogoAlumno, GrupoAcademico, InscripcionAlumno, PeriodoEscolar
from models.docencia import AsistenciaDocente, CargaDocente, ClaseDocente, SeguimientoAlumnoDocente
from tests.conftest import auth_headers, get_token


def test_reporte_multigrupo_y_exportaciones(client, db, admin_user):
    periodo = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    db.add(periodo); db.flush()
    grupos = [GrupoAcademico(periodo_id=periodo.id, carrera="TIEID", cuatrimestre=3, grupo=letra, activo=True) for letra in ("A", "B")]
    db.add_all(grupos); db.flush()
    alumnos = []
    for indice, grupo in enumerate(grupos, 1):
        alumno = CatalogoAlumno(matricula=f"UTC-R-{indice}", apellido_paterno="Alumno", apellido_materno="Prueba", nombres=str(indice), carrera="TIEID", cuatrimestre=3, grupo=grupo.grupo, periodo=periodo.clave, activo=True)
        db.add(alumno); db.flush(); alumnos.append(alumno)
        db.add(InscripcionAlumno(alumno_id=alumno.id, grupo_academico_id=grupo.id, estado="ACTIVO"))
        carga = CargaDocente(docente_id=admin_user.id, periodo_id=periodo.id, grupo_academico_id=grupo.id, tipo_actividad="CLASE", actividad_nombre="Bases de Datos", dia_semana=2, hora_inicio="08:00", hora_fin="09:00", estado="ACTIVA", activo=True)
        db.add(carga); db.flush()
        clase = ClaseDocente(carga_docente_id=carga.id, fecha=datetime.date(2026, 8, 20), estado="CERRADA", tema_impartido="Modelo relacional", avance_planeacion=75, tema_pendiente="Revisar normalización", incidencias="El grupo requiere reforzamiento" if indice == 1 else None, incidencia_tipo="ACADEMICA" if indice == 1 else None)
        db.add(clase); db.flush()
        db.add(AsistenciaDocente(clase_docente_id=clase.id, alumno_id=alumno.id, estado="FALTA" if indice == 1 else "PRESENTE"))
        if indice == 1:
            db.add(SeguimientoAlumnoDocente(docente_id=admin_user.id, carga_docente_id=carga.id, alumno_id=alumno.id, tipo="OBSERVACION", titulo="Revisar asistencia", estado="PENDIENTE"))
    db.commit()
    headers = auth_headers(get_token(client, "admin@test.com", "AdminPass123"))
    params = {"periodo_id": periodo.id, "grupos": ",".join(str(g.id) for g in grupos)}

    respuesta = client.get("/reportes-academicos", params=params, headers=headers)
    assert respuesta.status_code == 200, respuesta.text
    data = respuesta.json()
    assert data["resumen"]["grupos"] == 2
    assert data["resumen"]["alumnos"] == 2
    assert data["resumen"]["incidencias"] == 1
    assert data["resumen"]["alumnos_atencion"] == 1
    assert data["materias"][0]["ultimo_tema"] == "Modelo relacional"
    assert "confidenciales" in data["privacidad"]

    excel = client.get("/reportes-academicos/exportar.xlsx", params=params, headers=headers)
    assert excel.status_code == 200
    assert excel.content[:2] == b"PK"
    pdf = client.get("/reportes-academicos/exportar.pdf", params=params, headers=headers)
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")
