"""Regression tests use only conftest's isolated SQLite database."""
import datetime
import io
import zipfile
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from dependencies import decodificar_token, crear_access_token, hashear_password
from models.auth_session import AuthSession
from models.usuario import Usuario, RolUsuario
from models.sesion import SesionClase
from models.laboratorio import Laboratorio
from middleware.body_limit import BodyLimitMiddleware
from services.upload_limits import validate_archive
from tests.conftest import get_token, auth_headers


@pytest.fixture
def foreign_session(db, admin_user, lab):
    s = SesionClase(laboratorio_id=lab.id, docente_id=admin_user.id,
        codigo_sesion='SEC-TEST', estado='ABIERTA', materia='Ficticia')
    db.add(s)
    db.commit()
    return s


@pytest.mark.parametrize('role', [RolUsuario.ALUMNO, RolUsuario.DOCENTE, RolUsuario.LAB_ADMIN])
def test_foreign_lab_session_is_denied(client, db, docente_user, foreign_session, role):
    other = Laboratorio(nombre='Otro laboratorio', capacidad=10, activo=True)
    db.add(other)
    db.flush()
    docente_user.rol = role
    docente_user.laboratorio_id = other.id
    db.commit()
    headers = auth_headers(get_token(client, 'docente@test.com', 'DocentePass123'))
    root = f'/sesiones/{foreign_session.id}'
    for suffix in ['', '/mapa', '/asignaciones', '/observaciones']:
        assert client.get(root + suffix, headers=headers).status_code == 403
    assert client.post(root + '/cerrar', json={}, headers=headers).status_code == 403
    assert client.post(root + '/autoasignacion-token', headers=headers).status_code == 403
    assert client.post(root + '/observaciones', json={'tipo':'SIN_NOVEDAD'}, headers=headers).status_code == 403
    assert db.get(SesionClase, foreign_session.id).estado == 'ABIERTA'


def test_query_filters_cannot_override_teacher_scope(client, docente_user, foreign_session):
    headers = auth_headers(get_token(client, 'docente@test.com', 'DocentePass123'))
    response = client.get('/sesiones', params={'docente_id':foreign_session.docente_id}, headers=headers)
    assert response.status_code == 200
    assert response.json() == []
    assert client.get('/sesiones/activas', headers=headers).json() == []


def test_logout_is_persistent_and_login_never_revives_old_token(client, db, admin_user):
    token = get_token(client, 'admin@test.com', 'AdminPass123')
    sid = decodificar_token(token.split()[-1])['sid']
    assert client.post('/auth/sessions/logout', json={'session_id':'attacker-chosen'}, headers=auth_headers(token)).status_code == 200
    db.expire_all()
    assert db.get(AuthSession, sid).revoked_at is not None
    assert client.get('/auth/me', headers=auth_headers(token)).status_code == 401
    fresh = get_token(client, 'admin@test.com', 'AdminPass123')
    assert fresh != token
    assert client.get('/auth/me', headers=auth_headers(fresh)).status_code == 200
    assert client.get('/auth/me', headers=auth_headers(token)).status_code == 401


def test_revoke_other_session_even_without_recent_heartbeat(client, db, admin_user):
    first = get_token(client, 'admin@test.com', 'AdminPass123')
    second = get_token(client, 'admin@test.com', 'AdminPass123')
    sid = decodificar_token(second.split()[-1])['sid']
    db.get(AuthSession, sid).last_seen = datetime.datetime(2000, 1, 1)
    db.commit()
    assert client.post('/auth/sessions/logout-others', json={'session_id':'ignored'}, headers=auth_headers(first)).status_code == 200
    assert client.get('/auth/me', headers=auth_headers(second)).status_code == 401
    assert client.get('/auth/me', headers=auth_headers(first)).status_code == 200


def test_password_change_revokes_all_prior_tokens(client, db, admin_user):
    first = get_token(client, 'admin@test.com', 'AdminPass123')
    second = get_token(client, 'admin@test.com', 'AdminPass123')
    response = client.put('/usuarios/me/password', json={'password_actual':'AdminPass123', 'password_nuevo':'CorrectaNueva123!'}, headers=auth_headers(first))
    assert response.status_code == 200
    for token in [first, second]:
        assert client.get('/auth/me', headers=auth_headers(token)).status_code == 401
    new = get_token(client, 'admin@test.com', 'CorrectaNueva123!')
    assert client.get('/auth/me', headers=auth_headers(new)).status_code == 200


def test_signed_token_without_registered_session_is_rejected(client, admin_user):
    token = crear_access_token({'sub':str(admin_user.id), 'rol':'SUPER_ADMIN', 'exp':datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=2)})
    assert client.get('/auth/me', headers={'Authorization':'Bearer '+token}).status_code == 401


def test_oversized_auth_body_rejected_before_parsing():
    app = FastAPI()
    app.add_middleware(BodyLimitMiddleware)
    @app.post('/auth/login')
    def login():
        raise AssertionError('oversized body reached handler')
    with TestClient(app) as client:
        assert client.post('/auth/login', content=b'x'*(64*1024+1)).status_code == 413


def test_high_expansion_zip_rejected_without_extracting():
    data = io.BytesIO()
    with zipfile.ZipFile(data, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('manifest.json', 'x'*100000)
    with pytest.raises(HTTPException) as result:
        validate_archive(data.getvalue())
    assert result.value.status_code == 413


def test_password_recovery_invalidates_existing_tokens(client, db, docente_user):
    import hashlib
    from models.password_reset import PasswordResetToken
    token = get_token(client, 'docente@test.com', 'DocentePass123')
    raw = 'test-reset-token-' * 4
    db.add(PasswordResetToken(usuario_id=docente_user.id,
        token_hash=hashlib.sha256(raw.encode()).hexdigest(),
        expira_en=datetime.datetime.utcnow()+datetime.timedelta(minutes=10)))
    db.commit()
    assert client.post('/auth/password/reset', json={'token':raw,'password':'NuevaRecuperada123!'}).status_code == 200
    assert client.get('/auth/me', headers=auth_headers(token)).status_code == 401


def test_expired_persistent_session_is_rejected(client, db, admin_user):
    token = get_token(client, 'admin@test.com', 'AdminPass123')
    sid = decodificar_token(token.split()[-1])['sid']
    db.get(AuthSession, sid).expires_at = datetime.datetime(2000,1,1)
    db.commit()
    assert client.get('/auth/me', headers=auth_headers(token)).status_code == 401


def test_websocket_rechecks_revocation(client, admin_user, monkeypatch):
    import ws.mapa as module
    from tests.conftest import TestingSessionLocal
    from starlette.websockets import WebSocketDisconnect
    monkeypatch.setattr(module, 'SessionLocal', TestingSessionLocal)
    monkeypatch.setenv('FRONTEND_URL', '')
    app = FastAPI()
    app.add_api_websocket_route('/ws/mapa/{lab_id}', module.websocket_mapa)
    token = get_token(client, 'admin@test.com', 'AdminPass123')
    with TestClient(app) as ws_client:
        with ws_client.websocket_connect('/ws/mapa/1', subprotocols=['siga-auth',token.split()[-1]]) as connection:
            assert connection.receive_json()['tipo'] == 'snapshot'
            assert client.post('/auth/sessions/logout', json={'session_id':'ignored'}, headers=auth_headers(token)).status_code == 200
            connection.send_text('ping')
            with pytest.raises(WebSocketDisconnect):
                connection.receive_text()


def test_websocket_denies_teacher_without_own_open_session(client, docente_user, monkeypatch):
    import ws.mapa as module
    from tests.conftest import TestingSessionLocal
    from starlette.websockets import WebSocketDisconnect
    monkeypatch.setattr(module, 'SessionLocal', TestingSessionLocal)
    monkeypatch.setenv('FRONTEND_URL', '')
    app = FastAPI()
    app.add_api_websocket_route('/ws/mapa/{lab_id}', module.websocket_mapa)
    token = get_token(client, 'docente@test.com', 'DocentePass123')
    with TestClient(app) as ws_client:
        with pytest.raises(WebSocketDisconnect):
            with ws_client.websocket_connect('/ws/mapa/1', subprotocols=['siga-auth',token.split()[-1]]):
                pass
