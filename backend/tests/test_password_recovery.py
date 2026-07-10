import datetime

from dependencies import hashear_password, verificar_password
from models.auditoria import AuditLog
from models.password_reset import PasswordResetToken
from models.usuario import RolUsuario, Usuario


def _user(db, email="persona@utecan.edu.mx"):
    user = Usuario(
        nombre="Persona UTECAN", email=email,
        password_hash=hashear_password("Anterior1!Segura"),
        rol=RolUsuario.DOCENTE, activo=True,
    )
    db.add(user); db.commit(); db.refresh(user)
    return user


def _request_link(client, monkeypatch, email="persona@utecan.edu.mx"):
    captured = {}

    def fake_send(destinatario, nombre, url, minutos):
        captured.update(destinatario=destinatario, nombre=nombre, url=url, minutos=minutos)
        return True

    monkeypatch.setattr("routers.auth.enviar_recuperacion_password", fake_send)
    response = client.post("/auth/password/forgot", json={"email": email})
    return response, captured


def test_recuperacion_completa_es_de_un_solo_uso(client, db, monkeypatch):
    user = _user(db)
    requested, captured = _request_link(client, monkeypatch)
    assert requested.status_code == 200
    assert captured["destinatario"] == user.email
    assert captured["minutos"] == 30
    token = captured["url"].rsplit("/", 1)[-1]
    assert token not in db.query(PasswordResetToken).first().token_hash

    assert client.get(f"/auth/password/reset/{token}").json() == {"valido": True}
    changed = client.post("/auth/password/reset", json={
        "token": token, "password": "NuevaClave1!Segura",
    })
    assert changed.status_code == 200
    db.refresh(user)
    assert verificar_password("NuevaClave1!Segura", user.password_hash)
    assert client.post("/auth/password/reset", json={
        "token": token, "password": "OtraClave2!Segura",
    }).status_code == 400
    acciones = {row.accion for row in db.query(AuditLog).all()}
    assert "RECUPERACION_SOLICITADA" in acciones
    assert "RECUPERACION_USADA" in acciones


def test_solicitud_no_revela_si_cuenta_existe(client, db, monkeypatch):
    _user(db)
    existing, _ = _request_link(client, monkeypatch)
    missing = client.post("/auth/password/forgot", json={"email": "nadie@utecan.edu.mx"})
    external = client.post("/auth/password/forgot", json={"email": "persona@gmail.com"})
    assert existing.status_code == missing.status_code == external.status_code == 200
    assert existing.json() == missing.json() == external.json()


def test_solicitud_nueva_invalida_enlace_anterior(client, db, monkeypatch):
    _user(db)
    _, first = _request_link(client, monkeypatch)
    token1 = first["url"].rsplit("/", 1)[-1]
    _, second = _request_link(client, monkeypatch)
    token2 = second["url"].rsplit("/", 1)[-1]
    assert token1 != token2
    assert client.get(f"/auth/password/reset/{token1}").status_code == 400
    assert client.get(f"/auth/password/reset/{token2}").status_code == 200


def test_rechaza_password_debil_y_token_expirado(client, db, monkeypatch):
    _user(db)
    _, captured = _request_link(client, monkeypatch)
    token = captured["url"].rsplit("/", 1)[-1]
    weak = client.post("/auth/password/reset", json={"token": token, "password": "Admin123!!"})
    assert weak.status_code == 422

    row = db.query(PasswordResetToken).first()
    row.expira_en = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(seconds=1)
    db.commit()
    assert client.get(f"/auth/password/reset/{token}").status_code == 400
