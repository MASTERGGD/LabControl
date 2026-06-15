"""
Seeder inicial de LabControl UTECAN.
Crea el usuario SUPER_ADMIN si no existe ninguno.

Seguridad:
  - NO hay contraseña por defecto hardcodeada. Se toma de SEED_ADMIN_PASSWORD.
  - Si esa variable no está definida, se genera una contraseña aleatoria fuerte
    que se imprime UNA sola vez en el arranque (no vuelve a mostrarse).
  - El admin sembrado se marca con debe_cambiar_password=True para forzar el
    cambio en el primer inicio de sesión.
"""
from sqlalchemy.orm import Session
from models.usuario import Usuario, RolUsuario
from dependencies import hashear_password
import os
import secrets


SEED_EMAIL  = os.getenv("SEED_ADMIN_EMAIL",  "admin@utecan.edu.mx")
SEED_NOMBRE = os.getenv("SEED_ADMIN_NOMBRE", "Administrador Sistema")


def run_seed(db: Session):
    existe = db.query(Usuario).filter(Usuario.rol == RolUsuario.SUPER_ADMIN).first()
    if existe:
        return  # Ya hay un SUPER_ADMIN, nada que hacer

    es_produccion = os.getenv("APP_ENV", "development").lower() in ("production", "prod")

    # Contraseña: de la variable de entorno. En produccion es OBLIGATORIA
    # (no se genera ni se imprime nada en logs). En desarrollo, si falta,
    # se genera una aleatoria fuerte que se muestra una sola vez.
    seed_password = os.getenv("SEED_ADMIN_PASSWORD")
    generada = False
    if not seed_password:
        if es_produccion:
            raise RuntimeError(
                "SEED_ADMIN_PASSWORD no configurada. En produccion debe definirse "
                "explicitamente para crear el SUPER_ADMIN inicial; no se generan "
                "ni imprimen contrasenas en logs de produccion."
            )
        seed_password = secrets.token_urlsafe(16)
        generada = True

    admin = Usuario(
        nombre=SEED_NOMBRE,
        email=SEED_EMAIL,
        numero_empleado="SA-001",
        password_hash=hashear_password(seed_password),
        rol=RolUsuario.SUPER_ADMIN,
        activo=True,
        debe_cambiar_password=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    print("=" * 60)
    print("  ✅  SUPER_ADMIN creado exitosamente")
    print(f"  📧  Email: {SEED_EMAIL}")
    if generada:
        # Solo en desarrollo: en produccion nunca se llega aqui sin variable.
        print(f"  🔑  Contraseña TEMPORAL (se muestra solo esta vez): {seed_password}")
        print("  ⚠️   Guárdala ahora. Define SEED_ADMIN_PASSWORD para fijarla tú mismo.")
    else:
        print("  🔑  Contraseña: la definida en SEED_ADMIN_PASSWORD (no se imprime)")
    print("  🔒  Se exigirá cambiarla en el primer inicio de sesión.")
    print("=" * 60)
