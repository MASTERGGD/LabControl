from pathlib import Path
import io
import json
import openpyxl

from dependencies import hashear_password
from models.usuario import Usuario, RolUsuario
from models.catalogo import CatalogoAlumno, CatalogoMateria, GrupoAcademico, InscripcionAlumno, PeriodoEscolar
from models.ficha_socioeconomica import FichaSocioeconomica
from tests.conftest import auth_headers, get_token


PLANTILLA = Path(r"C:\Users\mtrog\OneDrive\Escritorio\ESCRITORIO 13 DE MAYO\Proyectos TI\CONTROL DE LABORATORIOS\Plantilla_Alumnos_UTECAN.xlsx")


def test_consulta_codigo_postal_normaliza_domicilio(client, db, monkeypatch):
    admin = Usuario(nombre="Admin Postal", email="postal@test.mx", password_hash=hashear_password("Test1234!"), rol=RolUsuario.SUPER_ADMIN, activo=True)
    db.add(admin); db.commit()
    payload = {"cp": "24900", "estado": "Campeche", "municipio": "Candelaria", "asentamientos": [{"nombre": "San Martín", "ciudad": "Candelaria"}, {"nombre": "Centro", "ciudad": "Candelaria"}]}
    class Respuesta:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self): return json.dumps(payload).encode("utf-8")
    monkeypatch.setattr("routers.servicios_escolares.urllib.request.urlopen", lambda *args, **kwargs: Respuesta())
    response = client.get("/servicios-escolares/catalogos/codigo-postal/24900", headers=auth_headers(get_token(client, admin.email, "Test1234!")))
    assert response.status_code == 200, response.text
    assert response.json() == {"codigo_postal": "24900", "estado": "Campeche", "municipio": "Candelaria", "localidad": "Candelaria", "colonias": ["Centro", "San Martín"]}


def test_activacion_masiva_de_fichas_es_idempotente(client, db):
    admin = Usuario(nombre="Admin Fichas", email="fichas@test.mx", password_hash=hashear_password("Test1234!"), rol=RolUsuario.SUPER_ADMIN, activo=True)
    alumnos = [CatalogoAlumno(matricula=f"UTC2600{i}", apellido_paterno="PRUEBA", apellido_materno="MASIVA", nombres=f"ALUMNO {i}", carrera="TIEID", cuatrimestre=1, grupo="A", periodo="MAY-AGO 2026", activo=True) for i in range(2)]
    db.add_all([admin, *alumnos]); db.commit()
    headers = auth_headers(get_token(client, admin.email, "Test1234!"))
    payload = {"alumno_ids": [a.id for a in alumnos], "periodo": "MAY-AGO 2026"}
    primera = client.post("/servicios-escolares/fichas/activar-masivo", headers=headers, json=payload)
    assert primera.status_code == 200, primera.text
    assert primera.json()["resumen"] == {"creadas": 2, "omitidas": 0, "errores": 0}
    ficha = db.query(FichaSocioeconomica).filter(FichaSocioeconomica.alumno_id == alumnos[0].id).one()
    assert ficha.nombre_completo == "PRUEBA MASIVA ALUMNO 0"
    assert ficha.carrera == "TIEID"
    segunda = client.post("/servicios-escolares/fichas/activar-masivo", headers=headers, json=payload)
    assert segunda.status_code == 200, segunda.text
    assert segunda.json()["resumen"] == {"creadas": 0, "omitidas": 2, "errores": 0}
    assert db.query(FichaSocioeconomica).count() == 2


def test_confirmar_importacion_crea_grupos_e_inscripciones(client, db):
    admin = Usuario(nombre="Admin Escolar", email="escolar@test.mx",
                    password_hash=hashear_password("Test1234!"),
                    rol=RolUsuario.SUPER_ADMIN, activo=True)
    db.add(admin); db.commit()
    # Regresión: la matrícula ya existe tanto en el periodo importado como en
    # uno histórico. La importación no debe intentar convertir uno en el otro.
    db.add_all([
        CatalogoAlumno(matricula="UTC250044", apellido_paterno="ARCOS",
            apellido_materno="", nombres="WILIAN", carrera="Lic. en Ing. en TIEID",
            cuatrimestre=3, grupo="A", periodo="MAY-AGO 2026", activo=True),
        CatalogoAlumno(matricula="UTC250044", apellido_paterno="ARCOS",
            apellido_materno="", nombres="WILIAN", carrera="Lic. en Ing. en TIEID",
            cuatrimestre=2, grupo="A", periodo="SEP-DIC 2025", activo=False),
    ])
    db.commit()
    token = get_token(client, "escolar@test.mx", "Test1234!")

    with PLANTILLA.open("rb") as fh:
        response = client.post(
            "/catalogo/alumnos/importar?preview=false",
            files={"file": (PLANTILLA.name, fh, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers=auth_headers(token),
        )
    assert response.status_code == 200, response.text
    assert response.json()["total_errores"] == 0

    grupos = client.get("/servicios-escolares/grupos", headers=auth_headers(token))
    assert grupos.status_code == 200, grupos.text
    assert len(grupos.json()) > 0
    assert sum(g["total_alumnos"] for g in grupos.json()) > 0

    wilian = db.query(CatalogoAlumno).filter(
        CatalogoAlumno.matricula == "UTC250044",
        CatalogoAlumno.periodo == "MAY-AGO 2026",
    ).one()
    cambio_a_cuarto = client.put(
        f"/catalogo/alumnos/{wilian.id}",
        json={"cuatrimestre": 4},
        headers=auth_headers(token),
    )
    assert cambio_a_cuarto.status_code == 200, cambio_a_cuarto.text
    regreso_a_tercero = client.put(
        f"/catalogo/alumnos/{wilian.id}",
        json={"cuatrimestre": 3},
        headers=auth_headers(token),
    )
    assert regreso_a_tercero.status_code == 200, regreso_a_tercero.text

    db.expire_all()
    activas = db.query(InscripcionAlumno).join(GrupoAcademico).filter(
        InscripcionAlumno.alumno_id == wilian.id,
        InscripcionAlumno.estado == "ACTIVO",
    ).all()
    assert len(activas) == 1
    assert activas[0].grupo_academico.cuatrimestre == 3
    assert activas[0].grupo_academico.grupo == "A"


def test_renombrar_carrera_actualiza_catalogos_y_alias_resuelve_excel(client, db):
    admin = Usuario(nombre="Admin Escolar", email="carreras@test.mx",
                    password_hash=hashear_password("Test1234!"),
                    rol=RolUsuario.SUPER_ADMIN, activo=True)
    db.add(admin); db.commit()
    headers = auth_headers(get_token(client, admin.email, "Test1234!"))
    creada = client.post("/servicios-escolares/carreras", headers=headers, json={
        "clave": "TI", "nombre": "TSU en Tecnologias de la Informacion",
        "nivel": "TSU", "division": "Tecnologias", "plan_estudios": "2024",
        "aliases": ["TSU TI"], "activo": True,
    })
    assert creada.status_code == 200, creada.text
    carrera_id = creada.json()["id"]

    periodo = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    alumno = CatalogoAlumno(matricula="UTC-CAR-1", apellido_paterno="LOPEZ", apellido_materno="",
        nombres="ANA", carrera="TSU en Tecnologias de la Informacion", cuatrimestre=3,
        grupo="A", periodo="MAY-AGO 2026", activo=True)
    db.add_all([periodo, alumno]); db.flush()
    grupo = GrupoAcademico(periodo_id=periodo.id, carrera=alumno.carrera, cuatrimestre=3, grupo="A", activo=True)
    materia = CatalogoMateria(nombre="Programacion", carrera=alumno.carrera, cuatrimestre_oficial=3, activo=True)
    db.add_all([grupo, materia]); db.commit()

    actualizado = client.put(f"/servicios-escolares/carreras/{carrera_id}", headers=headers, json={
        "clave": "DGS", "nombre": "TSU en Desarrollo y Gestion de Software",
        "nivel": "TSU", "division": "Tecnologias", "plan_estudios": "2024",
        "aliases": ["TSU TI"], "activo": True,
    })
    assert actualizado.status_code == 200, actualizado.text
    assert "TSU en Tecnologias de la Informacion" in actualizado.json()["aliases"]
    db.refresh(alumno); db.refresh(grupo); db.refresh(materia)
    assert alumno.carrera == "TSU en Desarrollo y Gestion de Software"
    assert grupo.carrera == alumno.carrera
    assert materia.carrera == alumno.carrera

    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Alumnos"
    ws.append(["titulo"]); ws.append(["leyenda"]); ws.append(["headers"]); ws.append(["ejemplo"])
    ws.append(["UTC-CAR-2", "PEREZ", "", "LUIS", "TSU TI", 3, "A", "MAY-AGO 2026"])
    contenido = io.BytesIO(); wb.save(contenido); contenido.seek(0)
    preview = client.post("/catalogo/alumnos/importar?preview=true", headers=headers,
        files={"file": ("alumnos.xlsx", contenido.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert preview.status_code == 200, preview.text
    assert preview.json()["total_errores"] == 0
