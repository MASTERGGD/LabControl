from models.departamento import Departamento
from services.user_permissions import es_departamento_division_carrera


def test_direccion_vinculacion_no_es_division_carrera():
    vinculacion = Departamento(clave="DV", nombre="Dirección de Vinculación")

    assert es_departamento_division_carrera(vinculacion) is False


def test_direccion_division_carrera_si_es_area_academica():
    division = Departamento(clave="DC", nombre="Dirección de División de Carrera")

    assert es_departamento_division_carrera(division) is True
