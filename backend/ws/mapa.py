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
from jose import JWTError
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

    async def conectar(self, websocket: WebSocket, lab_id: int):
        await websocket.accept()
        if lab_id not in self._canales:
            self._canales[lab_id] = []
        self._canales[lab_id].append(websocket)

    def desconectar(self, websocket: WebSocket, lab_id: int):
        canal = self._canales.get(lab_id, [])
        if websocket in canal:
            canal.remove(websocket)

    async def broadcast(self, lab_id: int, mensaje: dict):
        """Envía un mensaje a todos los clientes del laboratorio."""
        canal = list(self._canales.get(lab_id, []))
        muertos = []
        for ws in canal:
            try:
                await ws.send_text(json.dumps(mensaje, ensure_ascii=False))
            except Exception:
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

async def websocket_mapa(
    websocket: WebSocket,
    lab_id: int,
    token: str = Query(default=None),
):
    """
    ws://.../ws/mapa/{lab_id}?token=<JWT>
    Requiere token válido. Se desconecta automáticamente si el token es inválido
    o si el usuario no tiene permiso para ver ese laboratorio.
    """
    # 1. Validar presencia de token
    if not token:
        await websocket.close(code=4001, reason="Token requerido")
        return

    # 2. Decodificar y verificar firma JWT
    try:
        payload = decodificar_token(token)
    except JWTError:
        await websocket.close(code=4003, reason="Token inválido")
        return

    # 3. Autorizar acceso al laboratorio especifico.
    #    SUPER_ADMIN ve cualquier lab.
    #    LAB_ADMIN solo puede suscribirse al lab que tiene asignado.
    #    DOCENTE solo puede ver el lab donde tiene una sesion abierta.
    db_auth = SessionLocal()
    try:
        usuario_id = payload.get("sub")
        try:
            usuario_pk = int(usuario_id)
        except (TypeError, ValueError):
            await websocket.close(code=4003, reason="Token invalido")
            return

        usuario = db_auth.query(Usuario).filter(Usuario.id == usuario_pk).first()
        if not usuario or not usuario.activo:
            await websocket.close(code=4003, reason="Usuario no autorizado")
            return
        if usuario.rol == RolUsuario.LAB_ADMIN and usuario.laboratorio_id != lab_id:
            await websocket.close(code=4003, reason="Sin acceso a este laboratorio")
            return
        if usuario.rol == RolUsuario.DOCENTE:
            sesion = db_auth.query(SesionClase).filter(
                SesionClase.docente_id == usuario.id,
                SesionClase.laboratorio_id == lab_id,
                SesionClase.estado == "ABIERTA",
            ).first()
            if not sesion:
                await websocket.close(code=4003, reason="Sin sesion abierta en este laboratorio")
                return
    finally:
        db_auth.close()

    await manager.conectar(websocket, lab_id)
    db = SessionLocal()

    try:
        # Estado inicial
        snapshot = _snapshot_lab(lab_id, db)
        await websocket.send_text(json.dumps({
            "tipo": "estado_inicial",
            "lab_id": lab_id,
            "pcs": snapshot,
        }, ensure_ascii=False))

        # Mantener conexión viva con ping cada 30s
        while True:
            try:
                # Esperar mensaje del cliente (o timeout)
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if data == "ping":
                    await websocket.send_text(json.dumps({"tipo": "pong"}))
            except asyncio.TimeoutError:
                # Enviar ping al cliente
                await websocket.send_text(json.dumps({"tipo": "ping"}))
            except WebSocketDisconnect:
                break

    except WebSocketDisconnect:
        pass
    finally:
        manager.desconectar(websocket, lab_id)
        db.close()
