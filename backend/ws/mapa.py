"""
WebSocket — Mapa de PCs en tiempo real.

Cada laboratorio tiene su propio canal de broadcast.
Cuando una PC cambia de estado (libre/ocupada/en_clase/mantenimiento)
todos los clientes suscritos al lab reciben el mensaje al instante.

Conexión:
  ws://<host>/ws/mapa/{lab_id}?token=<JWT>

Mensajes del servidor (JSON):
  { "tipo": "estado_inicial",  "pcs": [ {pc_id, codigo, fila, estado, alumno?} ] }
  { "tipo": "pc_actualizada",  "pc":  {pc_id, codigo, fila, estado, alumno?} }
  { "tipo": "sesion_abierta",  "sesion": {id, materia, grupo, docente} }
  { "tipo": "sesion_cerrada",  "sesion_id": int }
  { "tipo": "ping" }
"""

from fastapi import WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from database import SessionLocal
from models.laboratorio import Computadora
from models.sesion import AsignacionPC, SesionClase
from models.usuario import Usuario, RolUsuario
from dependencies import decodificar_token
from jwt import PyJWTError as JWTError
import json
import asyncio
from typing import Dict, List

# Estados que bloquean la PC aunque haya sesión activa
ESTADOS_BLOQUEADOS = {"MANTENIMIENTO", "DAÑADO", "BAJA"}


# ─── Connection Manager ────────────────────────────────────────────────────────

class MapaConnectionManager:
    def __init__(self):
        # lab_id → lista de WebSockets activos
        self._canales: Dict[int, List[WebSocket]] = {}
        self._tokens = {}

    async def conectar(self, websocket: WebSocket, lab_id: int, token: str):
        await websocket.accept(subprotocol="siga-auth")
        if lab_id not in self._canales:
            self._canales[lab_id] = []
        self._tokens[websocket] = token
        self._canales[lab_id].append(websocket)

    def desconectar(self, websocket: WebSocket, lab_id: int):
        self._tokens.pop(websocket, None)
        canal = self._canales.get(lab_id, [])
        if websocket in canal:
            canal.remove(websocket)

    async def broadcast(self, lab_id: int, mensaje: dict):
        """Envía un mensaje a todos los clientes del laboratorio."""
        canal = list(self._canales.get(lab_id, []))
        muertos = []
        for ws in canal:
            try:
                with SessionLocal() as db:
                    _authorized_websocket_user(self._tokens.get(ws), lab_id, db)
                await ws.send_text(json.dumps(mensaje, ensure_ascii=False))
            except Exception:
                try:
                    await ws.close(code=4003, reason="Sesión finalizada")
                except Exception:
                    pass
                muertos.append(ws)
        for ws in muertos:
            self.desconectar(ws, lab_id)

    def clientes_activos(self, lab_id: int) -> int:
        return len(self._canales.get(lab_id, []))


# Instancia global (singleton)
manager = MapaConnectionManager()


# ─── Helpers de snapshot ───────────────────────────────────────────────────────

def _pcs_con_incidente_activo(lab_id: int, db: Session) -> set:
    """
    Devuelve el conjunto de computadora_id que tienen incidentes
    PENDIENTE o EN_REVISION (daños sin resolver).
    Se usa para bloquear la PC en el mapa aunque su estado en BD no haya sido actualizado.
    """
    try:
        from models.inventario import Incidente
        incidentes = db.query(Incidente).filter(
            Incidente.laboratorio_id == lab_id,
            Incidente.computadora_id != None,  # noqa: E711
            Incidente.estado.in_(["PENDIENTE", "EN_REVISION"]),
        ).all()
        return {i.computadora_id for i in incidentes}
    except Exception:
        return set()


def _snapshot_lab(lab_id: int, db: Session) -> list:
    """
    Genera el estado actual de todas las PCs del laboratorio:
    - Si hay sesión abierta → PC puede estar 'OCUPADA' (asignada) o 'EN_CLASE' (libre en sesión)
    - Si no hay sesión → estado del modelo (OPERATIVO, MANTENIMIENTO, etc.)
    - SIEMPRE: PCs con estado MANTENIMIENTO/DAÑADO/BAJA o con incidentes activos
      permanecen bloqueadas aunque haya sesión activa.
    """
    pcs = db.query(Computadora).filter(
        Computadora.laboratorio_id == lab_id,
        Computadora.activa == True
    ).order_by(Computadora.numero).all()

    # Sesión abierta en este lab
    sesion_activa = db.query(SesionClase).filter(
        SesionClase.laboratorio_id == lab_id,
        SesionClase.estado == "ABIERTA"
    ).first()

    asignadas = {}
    if sesion_activa:
        asigs = db.query(AsignacionPC).filter(
            AsignacionPC.sesion_id == sesion_activa.id,
            AsignacionPC.hora_liberacion == None  # noqa: E711
        ).all()
        asignadas = {a.computadora_id: a for a in asigs}

    # PCs con incidentes activos sin resolver (aunque el estado en BD no esté actualizado)
    pcs_dañadas = _pcs_con_incidente_activo(lab_id, db)

    resultado = []
    for pc in pcs:
        alumno = None

        # ── Prioridad 1: PC ya asignada a un alumno ──
        if sesion_activa and pc.id in asignadas:
            a = asignadas[pc.id]
            estado_ws = "OCUPADA"
            alumno = {
                "nombre": a.alumno_nombre,
                "matricula": a.alumno_matricula,
                "asignacion_id": a.id,
            }

        # ── Prioridad 2: PC bloqueada por estado o incidente activo ──
        # Si el admin puso OPERATIVO explícitamente, se respeta aunque haya incidentes abiertos.
        elif pc.estado in ESTADOS_BLOQUEADOS or (pc.id in pcs_dañadas and pc.estado != "OPERATIVO"):
            estado_ws = "MANTENIMIENTO"

        # ── Prioridad 3: PC libre en sesión activa ──
        elif sesion_activa:
            estado_ws = "EN_CLASE"

        # ── Prioridad 4: Sin sesión — usar estado real del modelo ──
        else:
            estado_ws = pc.estado

        resultado.append({
            "pc_id":      pc.id,
            "numero":     pc.numero,
            "codigo":     pc.codigo,
            "fila":       pc.fila,
            "specs":      pc.specs,
            "estado":     estado_ws,
            "alumno":     alumno,
            "sesion_id":  sesion_activa.id if sesion_activa else None,
            "bloqueada":  pc.estado in ESTADOS_BLOQUEADOS or (pc.id in pcs_dañadas and pc.estado != "OPERATIVO"),
        })
    return resultado


# ─── Endpoint WebSocket ───────────────────────────────────────────────────────

def _authorized_websocket_user(token, lab_id, db):
    from fastapi import Request
    from dependencies import get_current_user
    from services.session_access import require_lab_role
    user = get_current_user(Request({"type": "http", "method": "GET", "path": "/sesiones", "headers": []}), token, db)
    require_lab_role(user)
    if user.rol in {RolUsuario.LAB_ADMIN, RolUsuario.RESPONSABLE_LAB} and user.laboratorio_id != lab_id:
        raise ValueError("Laboratorio no autorizado")
    if user.rol == RolUsuario.DOCENTE:
        session = db.query(SesionClase).filter(SesionClase.docente_id == user.id,
            SesionClase.estado == "ABIERTA", SesionClase.laboratorio_id == lab_id).first()
        if not session:
            raise ValueError("Sin sesión propia abierta")
    return user


async def websocket_mapa(websocket: WebSocket, lab_id: int):
    protocols = websocket.scope.get("subprotocols", [])
    if len(protocols) != 2 or protocols[0] != "siga-auth":
        await websocket.close(code=4001, reason="Autenticación requerida")
        return
    token = protocols[1]
    expected_origin = __import__('os').getenv('FRONTEND_URL', '').rstrip('/')
    if expected_origin and websocket.headers.get('origin', '').rstrip('/') != expected_origin:
        await websocket.close(code=4003, reason="Origen no autorizado")
        return
    def authorized():
        with SessionLocal() as db:
            _authorized_websocket_user(token, lab_id, db)
    try:
        authorized()
    except Exception:
        await websocket.close(code=4003, reason="Acceso denegado")
        return
    await manager.conectar(websocket, lab_id, token)
    try:
        with SessionLocal() as db:
            snapshot = _snapshot_lab(lab_id, db)
        await websocket.send_json({"tipo": "snapshot", "pcs": snapshot})
        while True:
            try:
                message = await asyncio.wait_for(websocket.receive_text(), timeout=10)
            except asyncio.TimeoutError:
                message = None
            try:
                authorized()
            except Exception:
                await websocket.close(code=4003, reason="Sesión finalizada")
                break
            if message == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.desconectar(websocket, lab_id)
