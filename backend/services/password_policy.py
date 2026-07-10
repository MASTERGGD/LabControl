import re

COMMON_PASSWORDS = {
    "admin123", "admin123!", "administrador", "password", "password1",
    "password123", "qwerty123", "12345678", "123456789", "utecan123",
    "utecan2026", "bienvenido1", "welcome123",
}
COMMON_ALNUM_BASES = {
    "admin123", "password", "password1", "password123", "qwerty123",
    "12345678", "123456789", "utecan123", "utecan2026", "welcome123",
}


def password_policy_error(password: str) -> str | None:
    if len(password) < 10:
        return "La contraseña debe tener al menos 10 caracteres."
    if not re.search(r"[A-Z]", password):
        return "La contraseña debe incluir una letra mayúscula."
    if not re.search(r"[a-z]", password):
        return "La contraseña debe incluir una letra minúscula."
    if not re.search(r"\d", password):
        return "La contraseña debe incluir un número."
    if not re.search(r"[^A-Za-z0-9]", password):
        return "La contraseña debe incluir un símbolo."
    normalized = password.casefold()
    alnum_only = re.sub(r"[^a-z0-9]", "", normalized)
    if normalized in COMMON_PASSWORDS or alnum_only in COMMON_ALNUM_BASES:
        return "Esa contraseña es demasiado común. Elige una diferente."
    return None
