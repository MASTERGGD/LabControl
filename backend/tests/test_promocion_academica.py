import datetime

from models.catalogo import CatalogoAlumno, GrupoAcademico, InscripcionAlumno, PeriodoEscolar
from models.cierre_academico import CierreAcademicoPeriodo
from tests.conftest import auth_headers, get_token


def test_servicios_escolares_promueve_sin_borrar_historial(client, db, admin_user):
    origen = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=False)
    destino = PeriodoEscolar(clave="SEP-DIC 2026", activo=True, es_actual=True)
    db.add_all([origen, destino]); db.flush()
    grupo = GrupoAcademico(periodo_id=origen.id, carrera="TSU en TI", cuatrimestre=3, grupo="A", activo=True)
    alumno = CatalogoAlumno(
        matricula="20260001", apellido_paterno="Pérez", apellido_materno="López", nombres="Ana",
        carrera="TSU en TI", cuatrimestre=3, grupo="A", periodo=origen.clave, activo=True,
    )
    db.add_all([grupo, alumno]); db.flush()
    inscripcion = InscripcionAlumno(alumno_id=alumno.id, grupo_academico_id=grupo.id, estado="ACTIVO")
    db.add(inscripcion); db.flush()
    db.add(CierreAcademicoPeriodo(
        periodo_id=origen.id, estado="CERRADO", configurado_por_id=admin_user.id,
        cerrado_por_id=admin_user.id, cerrado_en=datetime.datetime.utcnow(),
    )); db.commit()
    headers = auth_headers(get_token(client, admin_user.email, "AdminPass123"))

    bandeja = client.get("/servicios-escolares/promociones", headers=headers, params={
        "periodo_origen_id": origen.id, "periodo_destino_id": destino.id,
    })
    assert bandeja.status_code == 200, bandeja.text
    assert bandeja.json()["alumnos"][0]["origen"] == "3° A"

    resolver = client.put(f"/servicios-escolares/promociones/{inscripcion.id}", headers=headers, json={
        "periodo_destino_id": destino.id, "resolucion": "PROMOVIDO",
        "cuatrimestre_destino": 4, "grupo_destino": "B", "observaciones": "Promoción ordinaria",
    })
    assert resolver.status_code == 200, resolver.text
    aplicar = client.post("/servicios-escolares/promociones/aplicar", headers=headers, params={
        "periodo_origen_id": origen.id, "periodo_destino_id": destino.id,
    })
    assert aplicar.status_code == 200, aplicar.text
    assert aplicar.json()["aplicadas"] == 1

    db.expire_all()
    historicas = db.query(InscripcionAlumno).filter(InscripcionAlumno.alumno_id == alumno.id).all()
    assert len(historicas) == 2
    assert {i.estado for i in historicas} == {"CONCLUIDA", "ACTIVO"}
    actualizado = db.query(CatalogoAlumno).get(alumno.id)
    assert (actualizado.cuatrimestre, actualizado.grupo, actualizado.periodo) == (4, "B", destino.clave)

    expediente = client.get(f"/expediente-academico/alumnos/{alumno.id}", headers=headers)
    assert expediente.status_code == 200, expediente.text
    trayectoria = expediente.json()["trayectoria_academica"]
    assert len(trayectoria) == 2
    assert trayectoria[0]["resolucion"] == "PROMOVIDO"


def test_servicios_escolares_crea_periodo_destino_en_preparacion(client, db, admin_user):
    origen = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    db.add(origen); db.commit()
    headers = auth_headers(get_token(client, admin_user.email, "AdminPass123"))

    respuesta = client.post(
        "/servicios-escolares/periodos",
        headers=headers,
        json={"clave": "SEP-DIC 2026"},
    )

    assert respuesta.status_code == 201, respuesta.text
    creado = respuesta.json()
    assert creado["clave"] == "SEP-DIC 2026"
    assert creado["estado"] == "PREPARACION"
    assert creado["es_actual"] is False
    assert db.query(PeriodoEscolar).filter_by(clave="SEP-DIC 2026", es_actual=False).count() == 1

    duplicado = client.post(
        "/servicios-escolares/periodos",
        headers=headers,
        json={"clave": "SEP-DIC 2026"},
    )
    assert duplicado.status_code == 409


def test_servicios_escolares_rechaza_clave_de_periodo_invalida(client, admin_user):
    headers = auth_headers(get_token(client, admin_user.email, "AdminPass123"))
    respuesta = client.post(
        "/servicios-escolares/periodos",
        headers=headers,
        json={"clave": "CUARTO 2026"},
    )
    assert respuesta.status_code == 422
