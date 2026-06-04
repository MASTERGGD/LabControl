from __future__ import annotations

import datetime
import threading
from dataclasses import dataclass

SESSION_TTL_SECONDS = 150


@dataclass
class ActiveSession:
    session_id: str
    usuario_id: int
    user_agent: str
    path: str | None
    created_at: datetime.datetime
    last_seen: datetime.datetime


_lock = threading.Lock()
_sessions: dict[str, ActiveSession] = {}


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _prune(now: datetime.datetime | None = None) -> None:
    now = now or _now()
    expired = [
        sid for sid, session in _sessions.items()
        if (now - session.last_seen).total_seconds() > SESSION_TTL_SECONDS
    ]
    for sid in expired:
        _sessions.pop(sid, None)


def register_session(usuario_id: int, session_id: str, user_agent: str = "", path: str | None = None) -> list[dict]:
    now = _now()
    with _lock:
        _prune(now)
        existing = _sessions.get(session_id)
        _sessions[session_id] = ActiveSession(
            session_id=session_id,
            usuario_id=usuario_id,
            user_agent=(user_agent or "")[:240],
            path=path[:180] if path else None,
            created_at=existing.created_at if existing else now,
            last_seen=now,
        )
        return list_user_sessions(usuario_id, current_session_id=session_id, prune=False)


def end_session(session_id: str) -> None:
    with _lock:
        _sessions.pop(session_id, None)


def list_user_sessions(usuario_id: int, current_session_id: str | None = None, prune: bool = True) -> list[dict]:
    now = _now()
    if prune:
        with _lock:
            _prune(now)
            sessions = [s for s in _sessions.values() if s.usuario_id == usuario_id]
    else:
        sessions = [s for s in _sessions.values() if s.usuario_id == usuario_id]

    sessions.sort(key=lambda s: s.last_seen, reverse=True)
    return [
        {
            "session_id": s.session_id,
            "current": bool(current_session_id and s.session_id == current_session_id),
            "user_agent": s.user_agent,
            "path": s.path,
            "created_at": s.created_at.isoformat(),
            "last_seen": s.last_seen.isoformat(),
        }
        for s in sessions
    ]
