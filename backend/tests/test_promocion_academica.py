import datetime

from models.catalogo import CatalogoAlumno, CatalogoCarrera, GrupoAcademico, InscripcionAlumno, PeriodoEscolar
from models.cierre_academico import CierreAcademicoPeriodo
from models.auditoria import AuditLog
from models.promocion_academica import PromocionAcademicaAlumno
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
    periodos = client.get("/servicios-escolares/periodos", headers=headers).json()
    por_clave = {item["clave"]: item for item in periodos}
    assert por_clave[origen.clave]["estado_periodo"] == "CERRADO"
    assert por_clave[destino.clave]["estado_periodo"] == "PREPARACION"

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
    grupo_destino = next(i.grupo_academico for i in historicas if i.estado == "ACTIVO")
    assert grupo_destino.generacion == "TSUTI-SEP2025"

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


def test_promocion_masiva_solo_actualiza_pendientes_y_conserva_excepciones(client, db, admin_user):
    origen = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    destino = PeriodoEscolar(clave="SEP-DIC 2026", activo=True, es_actual=False)
    db.add_all([origen, destino]); db.flush()
    grupo = GrupoAcademico(periodo_id=origen.id, carrera="TIEID", cuatrimestre=3, grupo="A", activo=True)
    db.add(grupo); db.flush()
    inscripciones = []
    for indice in range(3):
        alumno = CatalogoAlumno(
            matricula=f"UTC2600{indice}", apellido_paterno="Alumno", apellido_materno="Prueba",
            nombres=str(indice), carrera="TIEID", cuatrimestre=3, grupo="A",
            periodo=origen.clave, activo=True,
        )
        db.add(alumno); db.flush()
        inscripcion = InscripcionAlumno(alumno_id=alumno.id, grupo_academico_id=grupo.id, estado="ACTIVO")
        db.add(inscripcion); db.flush(); inscripciones.append(inscripcion)
    excepcion = PromocionAcademicaAlumno(
        alumno_id=inscripciones[0].alumno_id, inscripcion_origen_id=inscripciones[0].id,
        periodo_destino_id=destino.id, resolucion="REPITE", cuatrimestre_destino=3,
        grupo_destino="B", estado="RESUELTA", resuelto_por_id=admin_user.id,
    )
    db.add(excepcion); db.commit()
    headers = auth_headers(get_token(client, admin_user.email, "AdminPass123"))

    respuesta = client.put("/servicios-escolares/promociones", headers=headers, json={
        "periodo_destino_id": destino.id, "inscripcion_ids": [i.id for i in inscripciones],
        "resolucion": "PROMOVIDO", "cuatrimestre_destino": 4, "grupo_destino": "A",
        "observaciones": "Promoción ordinaria del grupo", "solo_pendientes": True,
    })

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["actualizadas"] == 2
    assert respuesta.json()["omitidas"] == 1
    db.expire_all()
    promociones = db.query(PromocionAcademicaAlumno).order_by(PromocionAcademicaAlumno.inscripcion_origen_id).all()
    assert len(promociones) == 3
    assert promociones[0].resolucion == "REPITE"
    assert [p.resolucion for p in promociones[1:]] == ["PROMOVIDO", "PROMOVIDO"]


def test_promocion_masiva_requiere_destino_para_promovidos(client, db, admin_user):
    destino = PeriodoEscolar(clave="SEP-DIC 2026", activo=True, es_actual=False)
    db.add(destino); db.commit()
    headers = auth_headers(get_token(client, admin_user.email, "AdminPass123"))
    respuesta = client.put("/servicios-escolares/promociones", headers=headers, json={
        "periodo_destino_id": destino.id, "inscripcion_ids": [999], "resolucion": "PROMOVIDO",
    })
    assert respuesta.status_code == 422


def test_continuidad_reune_varios_tsu_y_conforma_dos_grupos(client, db, admin_user):
    origen = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    destino = PeriodoEscolar(clave="SEP-DIC 2026", activo=True, es_actual=False)
    tsu_ia = CatalogoCarrera(clave="TSUIA", nombre="TSU en Inteligencia Artificial", nivel="TSU", activo=True)
    tsu_ds = CatalogoCarrera(clave="TSUDS", nombre="TSU en Desarrollo de Software", nivel="TSU", activo=True)
    ingenieria = CatalogoCarrera(clave="ITI", nombre="Ingeniería en Tecnologías de la Información e Innovación Digital", nivel="INGENIERIA", activo=True)
    db.add_all([origen, destino, tsu_ia, tsu_ds, ingenieria]); db.flush()
    inscripciones = []
    for carrera, letra in ((tsu_ia, "A"), (tsu_ds, "B")):
        grupo = GrupoAcademico(periodo_id=origen.id, carrera=carrera.nombre, cuatrimestre=6, grupo=letra, activo=True)
        db.add(grupo); db.flush()
        for indice in range(2):
            alumno = CatalogoAlumno(
                matricula=f"{carrera.clave}{indice}", apellido_paterno=carrera.clave,
                apellido_materno="Prueba", nombres=str(indice), carrera=carrera.nombre,
                cuatrimestre=6, grupo=letra, periodo=origen.clave, activo=True,
            )
            db.add(alumno); db.flush()
            inscripcion = InscripcionAlumno(alumno_id=alumno.id, grupo_academico_id=grupo.id, estado="ACTIVO")
            db.add(inscripcion); db.flush(); inscripciones.append(inscripcion)
    db.add(CierreAcademicoPeriodo(
        periodo_id=origen.id, estado="CERRADO", configurado_por_id=admin_user.id,
        cerrado_por_id=admin_user.id, cerrado_en=datetime.datetime.utcnow(),
    )); db.commit()
    headers = auth_headers(get_token(client, admin_user.email, "AdminPass123"))

    for carrera in (tsu_ia, tsu_ds):
        ruta = client.post("/servicios-escolares/promociones/continuidades", headers=headers, json={
            "carrera_origen_id": carrera.id, "carrera_destino_id": ingenieria.id,
            "cuatrimestre_origen": 6, "cuatrimestre_destino": 7,
        })
        assert ruta.status_code == 201, ruta.text

    bandeja = client.get("/servicios-escolares/promociones", headers=headers, params={
        "periodo_origen_id": origen.id, "periodo_destino_id": destino.id,
    })
    assert bandeja.status_code == 200, bandeja.text
    bolsa = bandeja.json()["bolsas_continuidad"][0]
    assert len(bolsa["alumnos"]) == 4
    assert len(bolsa["origenes"]) == 2

    conformar = client.post("/servicios-escolares/promociones/continuidad/conformar", headers=headers, json={
        "periodo_destino_id": destino.id, "carrera_destino_id": ingenieria.id,
        "inscripcion_ids": [item.id for item in inscripciones],
        "grupos": [{"grupo": "A", "capacidad": 2}, {"grupo": "B", "capacidad": 2}],
    })
    assert conformar.status_code == 200, conformar.text
    assert conformar.json()["asignados"] == 4

    aplicar = client.post("/servicios-escolares/promociones/aplicar", headers=headers, params={
        "periodo_origen_id": origen.id, "periodo_destino_id": destino.id,
    })
    assert aplicar.status_code == 200, aplicar.text
    db.expire_all()
    grupos_destino = db.query(GrupoAcademico).filter(GrupoAcademico.periodo_id == destino.id).all()
    assert {(grupo.carrera, grupo.cuatrimestre, grupo.grupo) for grupo in grupos_destino} == {
        (ingenieria.nombre, 7, "A"), (ingenieria.nombre, 7, "B"),
    }
    assert all(db.get(CatalogoAlumno, item.alumno_id).carrera == ingenieria.nombre for item in inscripciones)


def test_corrige_estadia_aplicada_sin_borrar_historial(client, db, admin_user):
    origen = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=False)
    destino = PeriodoEscolar(clave="SEP-DIC 2026", activo=True, es_actual=True)
    db.add_all([origen, destino]); db.flush()
    grupo = GrupoAcademico(periodo_id=origen.id, carrera="TIEID", cuatrimestre=6, grupo="A", activo=True)
    alumno = CatalogoAlumno(matricula="EST26001", apellido_paterno="Caso", apellido_materno="Prueba", nombres="Estadía",
                            carrera="TIEID", cuatrimestre=6, grupo="A", periodo=origen.clave, activo=True)
    db.add_all([grupo, alumno]); db.flush()
    inscripcion = InscripcionAlumno(alumno_id=alumno.id, grupo_academico_id=grupo.id, estado="ACTIVO")
    db.add(inscripcion); db.flush()
    db.add(CierreAcademicoPeriodo(periodo_id=origen.id, estado="CERRADO",
        configurado_por_id=admin_user.id, cerrado_por_id=admin_user.id)); db.commit()
    headers = auth_headers(get_token(client, admin_user.email, "AdminPass123"))
    resuelta = client.put(f"/servicios-escolares/promociones/{inscripcion.id}", headers=headers, json={
        "periodo_destino_id": destino.id, "resolucion": "ESTADIA", "observaciones": "Estadía inicial",
    })
    assert resuelta.status_code == 200, resuelta.text
    aplicada = client.post("/servicios-escolares/promociones/aplicar", headers=headers, params={
        "periodo_origen_id": origen.id, "periodo_destino_id": destino.id,
    })
    assert aplicada.json()["aplicadas"] == 1
    invalida = client.post(f"/servicios-escolares/promociones/{inscripcion.id}/corregir", headers=headers, json={
        "periodo_destino_id": destino.id, "resolucion": "PROMOVIDO",
        "cuatrimestre_destino": 7, "grupo_destino": "B", "motivo_correccion": "corto",
    })
    assert invalida.status_code == 422
    corregida = client.post(f"/servicios-escolares/promociones/{inscripcion.id}/corregir", headers=headers, json={
        "periodo_destino_id": destino.id, "resolucion": "PROMOVIDO",
        "cuatrimestre_destino": 7, "grupo_destino": "B",
        "motivo_correccion": "El alumno debe continuar en séptimo B",
        "observaciones": "Corrección autorizada por Servicios Escolares",
    })
    assert corregida.status_code == 200, corregida.text
    db.expire_all()
    promociones = db.query(PromocionAcademicaAlumno).all()
    assert len(promociones) == 1
    assert promociones[0].estado == "APLICADA" and promociones[0].resolucion == "PROMOVIDO"
    inscripciones = db.query(InscripcionAlumno).filter_by(alumno_id=alumno.id).all()
    estados = {(i.grupo_academico.grupo, i.estado) for i in inscripciones}
    assert ("ESTADIA", "CORREGIDA") in estados and ("B", "ACTIVO") in estados and ("A", "CONCLUIDA") in estados
    db.refresh(alumno)
    assert (alumno.cuatrimestre, alumno.grupo, alumno.activo) == (7, "B", True)
    auditoria = db.query(AuditLog).filter_by(accion="CORREGIR_PROMOCION_APLICADA").one()
    assert auditoria.detalle["anterior"]["resolucion"] == "ESTADIA"
    assert auditoria.detalle["nuevo"]["resolucion"] == "PROMOVIDO"
    assert auditoria.detalle["motivo"] == "El alumno debe continuar en séptimo B"
