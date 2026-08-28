import json

from models.usuario import RolUsuario, Usuario


def rol_principal(usuario: Usuario) -> RolUsuario:
    return getattr(usuario, "_rol_principal", None) or usuario.rol


def roles_disponibles(usuario: Usuario) -> list[RolUsuario]:
    principal = rol_principal(usuario)
    valores = [principal]
    try:
        adicionales = json.loads(usuario.roles_adicionales or "[]")
    except (TypeError, ValueError):
        adicionales = []
    for valor in adicionales:
        try:
            rol = RolUsuario(valor)
        except ValueError:
            continue
        if rol not in valores:
            valores.append(rol)
    return valores


def guardar_roles_adicionales(usuario: Usuario, roles: list[RolUsuario | str] | None) -> None:
    principal = rol_principal(usuario)
    valores = []
    for valor in roles or []:
        rol = valor if isinstance(valor, RolUsuario) else RolUsuario(valor)
        if rol != principal and rol not in valores:
            valores.append(rol)
    usuario.roles_adicionales = json.dumps([rol.value for rol in valores])
