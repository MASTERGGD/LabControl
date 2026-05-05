"""
Seeder inicial de LabControl UTECAN.
Crea el usuario SUPER_ADMIN si la tabla de usuarios está vacía.
Las credenciales por defecto se sobreescriben con variables de entorno.
"""
from sqlalchemy.orm import Session
from models.usuario import Usuario, RolUsuario
from dependencies import hashear_password
import os


SEED_EMAIL    = os.getenv("SEED_ADMIN_EMAIL",    "admin@utecan.edu.mx")
SEED_PASSWORD = os.getenv("SEED_ADMIN_PASSWORD", "LabControl2024!")
SEED_NOMBRE   = os.getenv("SEED_ADMIN_NOMBRE",   "Administrador Sistema")


def run_seed(db: Session):
    existe = db.query(Usuario).filter(Usuario.rol == RolUsuario.SUPER_ADMIN).first()
    if existe:
        return  # Ya hay un SUPER_ADMIN, nada que hacer

    admin = Usuario(
        nombre=SEED_NOMBRE,
        email=SEED_EMAIL,
        numero_empleado="SA-001",
        password_hash=hashear_password(SEED_PASSWORD),
        rol=RolUsuario.SUPER_ADMIN,
        activo=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    print("=" * 55)
    print("  ✅  SUPER_ADMIN creado exitosamente")
    print(f"  📧  Email:      {SEED_EMAIL}")
    print(f"  🔑  Contraseña: {SEED_PASSWORD}")
    print("  ⚠️   Cambia la contraseña tras el primer login")
    print("=" * 55)
