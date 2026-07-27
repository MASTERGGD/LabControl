from pathlib import Path

from dependencies import hashear_password
from models.usuario import Usuario, RolUsuario
from models.catalogo import CatalogoAlumno, GrupoAcademico, InscripcionAlumno
from tests.conftest import auth_headers, get_token


PLANTILLA = Path(r"C:\Users\mtrog\OneDrive\Escritorio\ESCRITORIO 13 DE MAYO\Proyectos TI\CONTROL DE LABORATORIOS\Plantilla_Alumnos_UTECAN.xlsx")


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
