"""Vinculación de sesiones tutoriales, permisos e historial de correcciones."""
import datetime

from fastapi import HTTPException
from models.auditoria import AuditLog
from models.catalogo import CatalogoAlumno
from models.docencia import CargaDocente
from models.tutoria import SesionTutoria, RegistroSesionAlumno, ProgramacionSesionTutoria, CierreTutoria, InformeBimestral, Canalizacion
from models.usuario import RolUsuario


def autorizar_tutor(usuario, tutor_id):
    if usuario.rol not in {RolUsuario.DOCENTE, RolUsuario.SUPER_ADMIN, RolUsuario.TUTORIA_ADMIN}:
        raise HTTPException(403, 'No tienes permiso para consultar o modificar tutorías')
    if usuario.rol == RolUsuario.DOCENTE and usuario.id != tutor_id:
        raise HTTPException(403, 'La sesión pertenece a otro tutor')


def bloqueo_edicion(db, grupo, fecha):
    bimestre = ((fecha.month - 1) % 4) // 2 + 1
    cierres = db.query(CierreTutoria).filter(CierreTutoria.periodo == grupo.periodo, CierreTutoria.estado == 'CERRADO').all()
    if any(c.alcance == 'CUATRIMESTRE' or c.bimestre is None or c.bimestre == bimestre for c in cierres):
        return 'El periodo o bimestre está cerrado. Solicita una corrección al responsable de Tutoría.'
    if db.query(InformeBimestral).filter(InformeBimestral.grupo_tutorado_id == grupo.id,
            InformeBimestral.bimestre == bimestre, InformeBimestral.estado.in_(['ENVIADO', 'RECIBIDO'])).first():
        return 'La sesión está incluida en un informe enviado o recibido. Solicita una corrección al responsable de Tutoría.'
    return None


def opciones_horario(db, grupo):
    return db.query(CargaDocente).filter(CargaDocente.grupo_tutorado_id == grupo.id,
        CargaDocente.docente_id == grupo.tutor_id, CargaDocente.tipo_actividad == 'TUTORIA',
        CargaDocente.activo == True, CargaDocente.estado == 'ACTIVO').all()


def resolver_horario(db, grupo, data, fecha, hora, sesion=None):
    if sesion:
        if data.carga_docente_id != sesion.carga_docente_id:
            raise HTTPException(422, 'La edición debe conservar la vinculación original con el horario')
        if data.fecha_programada != sesion.fecha_programada:
            raise HTTPException(422, 'Conserva la fecha programada original')
        return sesion.carga_docente_id, sesion.fecha_programada
    if data.extraordinaria:
        if data.carga_docente_id or data.programacion_id:
            raise HTTPException(422, 'Una sesión extraordinaria no puede completar una programación')
        if not (data.motivo_extraordinaria or '').strip():
            raise HTTPException(422, 'Indica el motivo de la tutoría extraordinaria')
        return None, None
    cargas = opciones_horario(db, grupo)
    programacion = db.get(ProgramacionSesionTutoria, data.programacion_id) if data.programacion_id else None
    original = data.fecha_programada or (programacion.fecha_programada if programacion else fecha)
    if data.carga_docente_id:
        carga = next((c for c in cargas if c.id == data.carga_docente_id), None)
        if not carga or carga.dia_semana != original.weekday():
            raise HTTPException(422, 'El bloque o fecha programada no corresponde al horario del tutor y grupo')
        if data.tipo_sesion != 'GRUPAL':
            raise HTTPException(422, 'Una tutoría individual no completa el bloque grupal del horario')
    elif data.tipo_sesion == 'GRUPAL' and hora:
        candidatos = [c for c in cargas if c.dia_semana == original.weekday()
                      and c.hora_inicio <= hora.strftime('%H:%M') < c.hora_fin]
        if len(candidatos) > 1:
            raise HTTPException(409, 'Hay varios bloques coincidentes; selecciona el bloque de tutoría')
        carga = candidatos[0] if candidatos else None
    else:
        carga = None
    if carga:
        existente = db.query(SesionTutoria).filter(SesionTutoria.carga_docente_id == carga.id,
                                                  SesionTutoria.fecha_programada == original).first()
        if existente:
            raise HTTPException(409, f'Esta tutoría ya está registrada (sesión {existente.id}). Ábrela para consultar o editar.')
        return carga.id, original
    return None, None


def sesion_de_bloque(db, carga_id, fecha):
    return db.query(SesionTutoria).filter(SesionTutoria.carga_docente_id == carga_id,
                                         SesionTutoria.fecha_programada == fecha).first()


def datos_sesion(db, sesion):
    datos = {c.name: getattr(sesion, c.name) for c in sesion.__table__.columns}
    datos = {k: v.isoformat() if isinstance(v, (datetime.date, datetime.time)) else v for k, v in datos.items()}
    prog = db.query(ProgramacionSesionTutoria).filter(ProgramacionSesionTutoria.sesion_id == sesion.id).first()
    datos['programacion_id'] = prog.id if prog else None
    datos['registros'] = []
    for r in db.query(RegistroSesionAlumno).filter(RegistroSesionAlumno.sesion_id == sesion.id).order_by(RegistroSesionAlumno.alumno_id):
        alumno = db.get(CatalogoAlumno, r.alumno_id)
        item = {c.name: getattr(r, c.name) for c in r.__table__.columns}
        item.update(nombre=' '.join(filter(None, [alumno.apellido_paterno, alumno.apellido_materno, alumno.nombres])), matricula=alumno.matricula)
        canal = db.query(Canalizacion).filter(Canalizacion.sesion_id == sesion.id, Canalizacion.alumno_id == r.alumno_id).first()
        item['canalizacion_existente'] = bool(canal)
        item['canalizacion'] = {'area': ('MEDICO' if canal.tipo_medico else 'PSICOLOGIA' if canal.tipo_psicologico
                                      else 'PERSONAL' if canal.tipo_personal else 'PEDAGOGIA'), 'motivo': canal.motivo} if canal else {'area': 'ASESORIA_ACADEMICA', 'motivo': ''}
        datos['registros'].append(item)
    return datos


def guardar_historial(db, usuario, sesion, antes, despues, motivo):
    # Se guarda en la misma transacción que la corrección: nunca hay cambios sin historial.
    db.add(AuditLog(usuario_id=usuario.id, usuario_nombre=usuario.nombre, usuario_email=usuario.email,
        accion='EDITAR_SESION_TUTORIA', recurso='TUTORIA', recurso_id=sesion.id,
        detalle={'motivo': motivo, 'antes': antes, 'despues': despues}))
