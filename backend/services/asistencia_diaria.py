"""Corte de asistencia confirmada, sin duplicar alumnos entre sesiones."""
from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy.orm import selectinload

from models.catalogo import GrupoAcademico, PeriodoEscolar
from models.docencia import CargaDocente, ClaseDocente
from services.calendario_academico import estado_fecha_academica
from services.timezone import now_mx


def asistencia_diaria(db, periodo_id, fecha=None, carrera=None):
    corte = now_mx()
    fecha = fecha or corte.date()
    if fecha > corte.date():
        raise HTTPException(422, "La fecha no puede ser posterior a hoy")
    periodo = db.get(PeriodoEscolar, periodo_id)
    if not periodo:
        raise HTTPException(404, "Periodo escolar no encontrado")
    grupos = db.query(GrupoAcademico).filter(
        GrupoAcademico.periodo_id == periodo_id, GrupoAcademico.activo == True,
    ).order_by(GrupoAcademico.carrera, GrupoAcademico.cuatrimestre, GrupoAcademico.grupo).all()
    carreras = sorted({g.carrera for g in grupos})
    if carrera and carrera not in carreras:
        raise HTTPException(422, "La carrera no pertenece al periodo seleccionado")
    grupos = [g for g in grupos if not carrera or g.carrera == carrera]
    ids = [g.id for g in grupos]
    cargas = db.query(CargaDocente).filter(
        CargaDocente.periodo_id == periodo_id,
        CargaDocente.grupo_academico_id.in_(ids),
        CargaDocente.tipo_actividad == "CLASE",
    ).all()
    por_carga = {c.id: c for c in cargas}
    clases = db.query(ClaseDocente).options(selectinload(ClaseDocente.asistencias)).filter(
        ClaseDocente.carga_docente_id.in_(por_carga), ClaseDocente.fecha == fecha,
    ).all()
    por_id = {c.carga_docente_id: c for c in clases}
    calendario = estado_fecha_academica(db, periodo_id, fecha)
    exige_lista = calendario['requiere_asistencia'] and calendario['permite_iniciar_clase']
    esperadas = defaultdict(set)
    futuras = defaultdict(set)
    confirmadas = defaultdict(set)
    observados = defaultdict(set)
    asistentes = defaultdict(set)
    en_captura = defaultdict(int)
    hora = corte.strftime('%H:%M')

    def programar(carga, inicio):
        destino = esperadas if fecha < corte.date() or inicio <= hora else futuras
        destino[carga.grupo_academico_id].add(carga.id)

    for carga in cargas:
        clase = por_id.get(carga.id)
        if clase and (clase.motivo_no_impartida or clase.cancelada_en or clase.estado == 'NO_IMPARTIDA'):
            continue
        if clase and clase.es_reposicion:
            if exige_lista:
                programar(carga, clase.hora_inicio_reposicion or carga.hora_inicio)
        elif exige_lista and periodo.es_actual and carga.activo and carga.estado == 'ACTIVO' and carga.dia_semana == fecha.weekday():
            programar(carga, carga.hora_inicio)

    for clase in clases:
        carga = por_carga[clase.carga_docente_id]
        grupo_id = carga.grupo_academico_id
        if clase.motivo_no_impartida or clase.cancelada_en or clase.estado == 'NO_IMPARTIDA':
            continue
        if clase.estado in {'ABIERTA', 'CORRECCION'}:
            en_captura[grupo_id] += 1
            esperadas[grupo_id].add(carga.id)
            futuras[grupo_id].discard(carga.id)
        if clase.estado != 'CERRADA' or not clase.asistencias:
            continue
        confirmadas[grupo_id].add(carga.id)
        esperadas[grupo_id].add(carga.id)
        futuras[grupo_id].discard(carga.id)
        for asistencia in clase.asistencias:
            observados[grupo_id].add(asistencia.alumno_id)
            if asistencia.estado in {'PRESENTE', 'RETARDO'}:
                asistentes[grupo_id].add(asistencia.alumno_id)

    filas = []
    for grupo in grupos:
        gid = grupo.id
        pendientes = len(esperadas[gid] - confirmadas[gid])
        estado = ('CON_LISTA' if confirmadas[gid] else 'SIN_LISTA' if esperadas[gid]
                  else 'POR_INICIAR' if futuras[gid] else 'SIN_ACTIVIDAD')
        filas.append({
            'id': gid, 'nombre': f'{grupo.cuatrimestre}° {grupo.grupo}',
            'carrera': grupo.carrera, 'turno': grupo.turno,
            'asistentes': len(asistentes[gid]), 'alumnos_con_registro': len(observados[gid]),
            'listas_confirmadas': len(confirmadas[gid]), 'listas_pendientes': pendientes,
            'listas_en_captura': en_captura[gid], 'estado': estado,
        })

    def resumen(grupos_resumen):
        ids_resumen = [g['id'] for g in grupos_resumen]
        return {
            'asistentes': len(set().union(*(asistentes[i] for i in ids_resumen))),
            'alumnos_con_registro': len(set().union(*(observados[i] for i in ids_resumen))),
            'grupos': len(grupos_resumen),
            'grupos_con_lista': sum(g['estado'] == 'CON_LISTA' for g in grupos_resumen),
            'grupos_sin_lista': sum(g['estado'] == 'SIN_LISTA' for g in grupos_resumen),
            'grupos_por_iniciar': sum(g['estado'] == 'POR_INICIAR' for g in grupos_resumen),
            'listas_confirmadas': sum(g['listas_confirmadas'] for g in grupos_resumen),
            'listas_pendientes': sum(g['listas_pendientes'] for g in grupos_resumen),
        }

    return {
        'fecha': fecha.isoformat(), 'corte': corte.isoformat(),
        'periodo': {'id': periodo.id, 'clave': periodo.clave},
        'carrera': carrera, 'carreras_disponibles': carreras,
        'resumen': resumen(filas), 'grupos': filas,
        'carreras': [{'carrera': nombre, **resumen([g for g in filas if g['carrera'] == nombre])}
                     for nombre in sorted({g['carrera'] for g in filas})],
        'nota_calendario': calendario.get('motivo'),
        'criterio': 'Cada alumno cuenta una vez si tiene PRESENTE o RETARDO en una lista cerrada del día. Las faltas justificadas no cuentan como presencia. No mide cuántos alumnos permanecen en el plantel. Las listas abiertas, en corrección o pendientes de sincronizar no cuentan como confirmadas.',
    }
