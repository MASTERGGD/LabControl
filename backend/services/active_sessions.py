"""Database-backed token validity, independent of presence."""
import datetime
import hashlib
import hmac
import secrets
from models.auth_session import AuthSession


def _now():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _credential_hash(password_hash):
    return hashlib.sha256(password_hash.encode('utf-8')).hexdigest()


def create_session(db, user, expires_at, user_agent=''):
    now = _now()
    session = AuthSession(id=secrets.token_urlsafe(32), usuario_id=user.id,
        credential_hash=_credential_hash(user.password_hash), created_at=now,
        last_seen=now, expires_at=expires_at.replace(tzinfo=None), user_agent=user_agent[:240])
    db.add(session)
    db.commit()
    return session.id


def is_session_revoked(db, user, session_id):
    if not session_id or not isinstance(session_id, str):
        return True
    session = db.get(AuthSession, session_id)
    return (session is None or session.usuario_id != user.id
        or session.revoked_at is not None or session.expires_at <= _now()
        or not hmac.compare_digest(session.credential_hash, _credential_hash(user.password_hash)))


def register_session(db, usuario_id, session_id, user_agent='', path=None):
    session = db.get(AuthSession, session_id)
    if session and session.usuario_id == usuario_id and session.revoked_at is None:
        session.last_seen = _now()
        session.user_agent = (user_agent or '')[:240]
        session.path = path[:180] if path else None
        db.commit()
    return list_user_sessions(db, usuario_id, session_id)


def end_session(db, usuario_id, session_id):
    db.query(AuthSession).filter(AuthSession.id == session_id, AuthSession.usuario_id == usuario_id).update(
        {AuthSession.revoked_at: _now()}, synchronize_session=False)
    db.commit()


def revoke_user_sessions(db, usuario_id, except_session_id=None):
    query = db.query(AuthSession).filter(AuthSession.usuario_id == usuario_id, AuthSession.revoked_at.is_(None))
    if except_session_id:
        query = query.filter(AuthSession.id != except_session_id)
    query.update({AuthSession.revoked_at: _now()}, synchronize_session=False)
    # Caller commits atomically with the password update.


def end_other_sessions(db, usuario_id, current_session_id):
    revoke_user_sessions(db, usuario_id, current_session_id)
    db.commit()


def list_user_sessions(db, usuario_id, current_session_id=None):
    sessions = db.query(AuthSession).filter(AuthSession.usuario_id == usuario_id,
        AuthSession.revoked_at.is_(None), AuthSession.expires_at > _now()).order_by(AuthSession.last_seen.desc()).all()
    return [{'session_id': s.id, 'current': s.id == current_session_id,
        'user_agent': s.user_agent, 'path': s.path, 'created_at': s.created_at.isoformat(),
        'last_seen': s.last_seen.isoformat()} for s in sessions]
