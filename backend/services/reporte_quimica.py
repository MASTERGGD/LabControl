"""Reporte químico: datos explícitos, horas reales y exportación del mismo corte firmado."""
import calendar
import datetime as dt
import hashlib
import hmac
import io
import json
import uuid
from collections import defaultdict
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy.orm import joinedload, selectinload
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

from dependencies import SECRET_KEY
from models.horario import Reservacion
from models.sesion import SesionClase
from models.inventario import Activo, Prestamo, Incidente
from models.practica_laboratorio import (
    PracticaLaboratorio, MovimientoInsumoLaboratorio, InsumoLaboratorio,
    IncidentePractica, ResiduoPractica,
)

ZONA = ZoneInfo('America/Mexico_City')
UTC = dt.timezone.utc


def local(value):
    if value is None:
        return None
    return value.replace(tzinfo=UTC).astimezone(ZONA) if value.tzinfo is None else value.astimezone(ZONA)


def sello(value):
    return local(value).isoformat() if value else None


def limites(mes, anio):
    if not 1 <= mes <= 12 or not 2000 <= anio <= 2200:
        raise HTTPException(422, 'Mes o año fuera de rango.')
    inicio = dt.datetime(anio, mes, 1, tzinfo=ZONA)
    fin = inicio + dt.timedelta(days=calendar.monthrange(anio, mes)[1])
    return inicio, fin


def horas_intervalo(inicio, fin, desde, hasta):
    inicio, fin = local(inicio), local(fin)
    if not inicio or not fin:
        return None
    inicio, fin = inicio.astimezone(UTC), fin.astimezone(UTC)
    desde, hasta = desde.astimezone(UTC), hasta.astimezone(UTC)
    if fin < inicio:
        return None
    return max(0, (min(fin, hasta) - max(inicio, desde)).total_seconds() / 3600)


def firma(reporte):
    # JSON en el navegador convierte 100.0 en 100: ambos representan la misma cantidad.
    def normalizar(value):
        if isinstance(value, dict):
            return {k: normalizar(v) for k, v in value.items()}
        if isinstance(value, list):
            return [normalizar(v) for v in value]
        if isinstance(value, float) and value.is_integer():
            return int(value)
        return value
    payload = json.dumps(normalizar(reporte), sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    return hmac.new(SECRET_KEY.encode(), ('reporte-quimica-v1:' + payload).encode(), hashlib.sha256).hexdigest()


def validar_corte(reporte, signature, usuario):
    try:
        valido = hmac.compare_digest(firma(reporte), signature)
        edad = dt.datetime.now(UTC) - dt.datetime.fromisoformat(reporte['generado_en'])
        valido = valido and reporte['usuario_id'] == usuario.id and dt.timedelta(0) <= edad <= dt.timedelta(hours=24)
    except (KeyError, TypeError, ValueError):
        valido = False
    if not valido:
        raise HTTPException(409, 'El reporte cambió o expiró. Actualiza la consulta antes de descargar.')


def generar(db, lab, mes, anio, usuario, rango=None):
    desde, hasta = rango or limites(mes, anio)
    hoy = dt.datetime.now(UTC).astimezone(ZONA).date()
    practicas = db.query(PracticaLaboratorio).join(Reservacion).filter(
        Reservacion.laboratorio_id == lab.id,
    ).options(
        joinedload(PracticaLaboratorio.reservacion).joinedload(Reservacion.docente),
        selectinload(PracticaLaboratorio.asistencias),
        selectinload(PracticaLaboratorio.materiales),
    ).order_by(PracticaLaboratorio.fecha_sesion, PracticaLaboratorio.id).all()
    por_id = {p.id: p for p in practicas}
    programadas, ejecuciones, asistentes, planes, calidad = [], [], [], {}, []
    participantes = []
    def en_mes(value):
        return value is not None and desde <= local(value) < hasta

    for p in practicas:
        r = p.reservacion
        programada = desde.date() <= p.fecha_sesion < hasta.date()
        duracion = horas_intervalo(p.iniciada_en, p.cerrada_en, desde, hasta)
        inicia_mes = en_mes(p.iniciada_en)
        pendiente = bool(p.iniciada_en and not p.cerrada_en and local(p.iniciada_en) < hasta)
        aporta = inicia_mes or en_mes(p.cerrada_en) or (duracion is not None and duracion > 0) or pendiente
        if not programada and not aporta:
            continue
        proposito = p.proposito or ('ACADEMICA' if r.carga_docente_id else 'SIN_VINCULACION')
        base = dict(id=p.id, fuente='PracticaLaboratorio', reservacion_id=r.id,
                    practica_id=p.practica_origen_id or p.id, titulo=p.titulo,
                    docente_id=r.docente_id, docente=r.docente.nombre,
                    materia=r.materia, grupo=r.grupo, proposito=proposito,
                    incluye_practica=p.incluye_practica,
                    fecha_programada=p.fecha_sesion.isoformat(), estado=p.estado)
        if programada:
            programadas.append(base)
            if p.incluye_practica:
                raiz = por_id.get(p.practica_origen_id or p.id)
                planes[base['practica_id']] = dict(id=base['practica_id'], titulo=raiz.titulo if raiz else p.titulo,
                    estado_plan=raiz.plan_estado if raiz and raiz.plan_estado else 'NO_REGISTRADO',
                    docente=r.docente.nombre, materia=r.materia, grupo=r.grupo)
        if aporta:
            ejecuciones.append(dict(base, inicio_real=sello(p.iniciada_en), fin_real=sello(p.cerrada_en),
                inicia_en_mes=inicia_mes, horas_confirmadas=round(duracion, 6) if duracion is not None else None,
                regularizacion='Pendiente de cierre' if pendiente else 'Fechas inconsistentes' if duracion is None else None))
        if inicia_mes:
            for a in p.asistencias:
                asistentes.append(dict(id=a.id, sesion_id=p.id, matricula=a.matricula,
                    nombre=a.alumno_nombre, estado=a.estado,
                    cuenta=a.estado in {'PRESENTE', 'RETARDO'}, fecha=sello(p.iniciada_en)))
            if p.participantes:
                participantes.append(dict(sesion_id=p.id, declaracion=p.participantes,
                    alcance='Declaración; no acredita asistencia ni personas únicas'))
            if proposito == 'ACADEMICA' and not p.asistencias:
                calidad.append(dict(sesion_id=p.id, motivo='Ejecución académica sin asistencia registrada; alcance de personas incompleto'))
        if proposito == 'SIN_VINCULACION':
            calidad.append(dict(sesion_id=p.id, motivo='Sin vinculación académica ni propósito declarado'))
        if p.estado == 'CERRADA' and not p.iniciada_en:
            calidad.append(dict(sesion_id=p.id, motivo='Cerrada sin inicio real registrado'))
        if p.estado == 'CERRADA' and not p.materiales:
            calidad.append(dict(sesion_id=p.id, motivo='Sin desglose de materiales registrado; no implica consumo cero'))
        for m in p.materiales:
            if not m.insumo_id:
                calidad.append(dict(sesion_id=p.id, material_id=m.id, material=m.descripcion, unidad=m.unidad,
                    entregado=m.cantidad_entregada, consumido=m.cantidad_consumida, devuelto=m.cantidad_devuelta,
                    motivo='Material sin insumo vinculado: cantidades declaradas, sin fecha de movimiento verificable'))

    # Las sesiones antiguas se muestran sin sumar otra vez una ejecución de práctica.
    claves_practica = {(p.reservacion_id, local(p.iniciada_en).date() if p.iniciada_en else p.fecha_sesion)
                       for p in practicas if p.iniciada_en}
    legacy = db.query(SesionClase).filter(SesionClase.laboratorio_id == lab.id,
        SesionClase.inicio < hasta.astimezone(UTC).replace(tzinfo=None)).order_by(SesionClase.id).all()
    for s in legacy:
        fecha = local(s.inicio).date() if s.inicio else None
        if s.reservacion_id is not None and (s.reservacion_id, fecha) in claves_practica:
            continue
        duracion = horas_intervalo(s.inicio, s.fin_real, desde, hasta)
        pendiente = bool(s.inicio and not s.fin_real)
        if not en_mes(s.inicio) and not en_mes(s.fin_real) and not pendiente and not (duracion is not None and duracion > 0):
            continue
        ejecuciones.append(dict(id=s.id, fuente='SesionClase', reservacion_id=s.reservacion_id,
            titulo=s.materia or 'Sesión anterior', docente_id=s.docente_id,
            materia=s.materia, grupo=s.grupo, estado=s.estado, inicio_real=sello(s.inicio),
            fin_real=sello(s.fin_real), inicia_en_mes=en_mes(s.inicio),
            horas_confirmadas=round(duracion, 6) if duracion is not None else None,
            regularizacion='Pendiente de cierre' if pendiente else 'Fechas inconsistentes' if duracion is None else None))
        calidad.append(dict(sesion_id=s.id, fuente='SesionClase', motivo='Sesión sin seguimiento de práctica; asistencia no inferida de PCs'))

    inicio_utc = desde.astimezone(UTC).replace(tzinfo=None)
    fin_utc = hasta.astimezone(UTC).replace(tzinfo=None)
    movimientos = db.query(MovimientoInsumoLaboratorio).join(InsumoLaboratorio).filter(
        InsumoLaboratorio.laboratorio_id == lab.id, MovimientoInsumoLaboratorio.creado_en >= inicio_utc,
        MovimientoInsumoLaboratorio.creado_en < fin_utc,
    ).options(joinedload(MovimientoInsumoLaboratorio.insumo)).order_by(MovimientoInsumoLaboratorio.id).all()
    filas_mov, grupos = [], defaultdict(float)
    for m in movimientos:
        fila = dict(id=m.id, sesion_id=m.practica_id, insumo_id=m.insumo_id,
            material=m.insumo.nombre, lote=m.insumo.lote, unidad=m.insumo.unidad,
            tipo=m.tipo, cantidad=m.cantidad, fecha=sello(m.creado_en), observaciones=m.observaciones)
        filas_mov.append(fila)
        grupos[(m.insumo_id, m.insumo.nombre, m.insumo.lote, m.insumo.unidad, m.tipo)] += m.cantidad
    consumos = [dict(insumo_id=k[0], material=k[1], lote=k[2], unidad=k[3], tipo=k[4], cantidad=round(v, 6))
                for k, v in grupos.items()]
    residuos = db.query(ResiduoPractica).join(PracticaLaboratorio).join(Reservacion).filter(
        Reservacion.laboratorio_id == lab.id, ResiduoPractica.creado_en >= inicio_utc,
        ResiduoPractica.creado_en < fin_utc).order_by(ResiduoPractica.id).all()
    filas_res = [dict(id=x.id, sesion_id=x.practica_id, descripcion=x.descripcion,
        clasificacion=x.clasificacion, cantidad=x.cantidad, unidad=x.unidad, destino=x.destino,
        fecha=sello(x.creado_en)) for x in residuos]
    grupos_res = defaultdict(float)
    for x in residuos:
        grupos_res[(x.descripcion, x.clasificacion, x.unidad)] += x.cantidad
    resumen_res = [dict(descripcion=k[0], clasificacion=k[1], unidad=k[2], cantidad=round(v, 6))
                   for k, v in grupos_res.items()]
    inc = db.query(IncidentePractica).join(PracticaLaboratorio).join(Reservacion).filter(
        Reservacion.laboratorio_id == lab.id).order_by(IncidentePractica.id).all()
    filas_inc = [dict(id=x.id, fuente='IncidentePractica', sesion_id=x.practica_id,
        tipo=x.tipo, severidad=x.severidad, estado=x.estado, descripcion=x.descripcion,
        fecha=sello(x.creado_en)) for x in inc if en_mes(x.creado_en)]
    # Incidentes de inventario originados en práctica ya están en la fuente anterior.
    inc_inv = db.query(Incidente).filter(Incidente.laboratorio_id == lab.id).order_by(Incidente.id).all()
    for x in inc_inv:
        if x.origen == 'PRACTICA':
            continue
        if en_mes(x.fecha_reporte):
            filas_inc.append(dict(id=x.id, fuente='Incidente', tipo=x.tipo, estado=x.estado,
                descripcion=x.descripcion, fecha=sello(x.fecha_reporte)))
    existencias = db.query(InsumoLaboratorio).filter(InsumoLaboratorio.laboratorio_id == lab.id,
        InsumoLaboratorio.activo == True).order_by(InsumoLaboratorio.id).all()
    stock = [dict(id=x.id, material=x.nombre, lote=x.lote, unidad=x.unidad,
        disponible=x.cantidad_disponible, minimo=x.stock_minimo,
        caducidad=x.caduca_en.isoformat() if x.caduca_en else None,
        bajo=x.cantidad_disponible <= x.stock_minimo,
        caducado=bool(x.caduca_en and x.caduca_en < hoy)) for x in existencias]
    activos = db.query(Activo).filter(Activo.laboratorio_id == lab.id, Activo.activo == True).order_by(Activo.id).all()
    equipos = [dict(id=x.id, codigo=x.codigo_inventario, nombre=x.nombre, categoria=x.categoria,
                    estado=x.estado) for x in activos]
    prestamos = db.query(Prestamo).join(Activo).filter(Activo.laboratorio_id == lab.id,
        Prestamo.estado.in_(['ACTIVO', 'VENCIDO'])).order_by(Prestamo.id).all()
    vencidos = [dict(id=x.id, activo_id=x.activo_id, estado=x.estado,
        vencimiento=sello(x.fecha_retorno_esperada)) for x in prestamos
        if x.estado == 'VENCIDO' or (x.fecha_retorno_esperada and local(x.fecha_retorno_esperada) < dt.datetime.now(UTC).astimezone(ZONA))]
    alertas = []
    for x in stock:
        if x['bajo'] or x['caducado']:
            alertas.append(dict(fuente='InsumoLaboratorio', id=x['id'], descripcion=x['material'],
                motivo=' / '.join(t for t, flag in [('Existencia baja', x['bajo']), ('Caducado', x['caducado'])] if flag)))
    for x in equipos:
        if x['estado'] in {'MANTENIMIENTO', 'DAÑADO'}:
            alertas.append(dict(fuente='Activo', id=x['id'], descripcion=x['nombre'], motivo=x['estado']))
    # Para incidentes enlazados al inventario, su seguimiento se atiende en inventario.
    enlazados = {x.origen_id for x in inc_inv if x.origen == 'PRACTICA'}
    for x in inc:
        if x.id not in enlazados and x.estado not in {'RESUELTO', 'CERRADO', 'CERRADA'}:
            alertas.append(dict(fuente='IncidentePractica', id=x.id, descripcion=x.descripcion, motivo=x.estado))
    for x in inc_inv:
        if x.estado not in {'REPARADO', 'DADO_DE_BAJA', 'CERRADO', 'RESUELTO'}:
            alertas.append(dict(fuente='Incidente', id=x.id, descripcion=x.descripcion, motivo=x.estado))
    for x in vencidos:
        alertas.append(dict(fuente='Prestamo', id=x['id'], descripcion='Préstamo vencido', motivo=x['vencimiento']))
    presentes = [a for a in asistentes if a['cuenta']]
    alumnos = sorted({a['matricula'].strip().upper() for a in presentes if a['matricula'] and a['matricula'].strip()})
    ejec_mes = [e for e in ejecuciones if e['inicia_en_mes']]
    practicas_ejecutadas = {}
    for e in ejec_mes:
        if e.get('incluye_practica'):
            practicas_ejecutadas.setdefault(e['practica_id'], dict(practica_id=e['practica_id'], titulo=e['titulo']))
    cerradas_mes = [e for e in ejecuciones if e['fin_real'] and en_mes(dt.datetime.fromisoformat(e['fin_real']))]
    docentes = sorted({e['docente_id'] for e in ejec_mes})
    pendientes = [e for e in ejecuciones if e['regularizacion']]
    def indicador(clave, titulo, valor, detalle, unidad=None):
        return dict(clave=clave, titulo=titulo, valor=valor, unidad=unidad, detalle=detalle)
    indicadores = [
        indicador('programadas', 'Sesiones programadas en el mes', len(programadas), programadas),
        indicador('practicas', 'Prácticas distintas programadas', len(planes), list(planes.values())),
        indicador('iniciadas', 'Sesiones iniciadas en el mes', len(ejec_mes), ejec_mes),
        indicador('ejecutadas', 'Prácticas con ejecución iniciada', len(practicas_ejecutadas), list(practicas_ejecutadas.values())),
        indicador('cerradas_reales', 'Sesiones con cierre real en el mes', len(cerradas_mes), cerradas_mes),
        indicador('horas', 'Horas reales confirmadas del mes', round(sum(e['horas_confirmadas'] or 0 for e in ejecuciones), 4), ejecuciones, 'h'),
        indicador('alumnos', 'Alumnos únicos con asistencia registrada', len(alumnos), [dict(matricula=m) for m in alumnos]),
        indicador('asistencias', 'Asistencias acumuladas', len(presentes), presentes),
        indicador('docentes', 'Docentes con ejecución en el mes', len(docentes), [dict(docente_id=x) for x in docentes]),
        indicador('regularizar', 'Sesiones por regularizar al corte del mes', len(pendientes), pendientes),
    ]
    for estado in ['SOLICITADA', 'PREPARADA', 'EN_CURSO', 'CERRADA', 'CANCELADA']:
        filas = [p for p in programadas if p['estado'] == estado]
        indicadores.append(indicador(estado, f'Sesiones {estado.lower().replace("_", " ")}', len(filas), filas))
    return dict(version=1, consulta_id=str(uuid.uuid4()), generado_en=dt.datetime.now(UTC).isoformat(),
        usuario_id=usuario.id, generado_por=usuario.nombre, zona_horaria=str(ZONA),
        laboratorio=dict(id=lab.id, nombre=lab.nombre, capacidad_registrada=lab.capacidad),
        periodo=dict(mes=mes, anio=anio, desde=desde.isoformat(), hasta_exclusivo=hasta.isoformat()),
        indicadores=indicadores, tablas=dict(sesiones=ejecuciones, programadas=programadas,
            practicas=list(planes.values()), asistencias=asistentes, participantes_declarados=participantes,
            materiales_por_unidad=consumos, movimientos=filas_mov, residuos=filas_res,
            residuos_por_unidad=resumen_res, incidentes=filas_inc,
            informacion_incompleta=calidad, existencias_actuales=stock, activos_actuales=equipos,
            prestamos_vencidos_actuales=vencidos, alertas_actuales=alertas),
        reglas=[
            'Programación por fecha prevista; ejecución y asistencia por inicio real en America/Mexico_City.',
            'Horas confirmadas repartidas entre meses; sin fin real no se usa el horario estimado. Las horas son horas-sesión, no ocupación neta si hay traslapes.',
            'PRESENTE y RETARDO cuentan; FALTA y JUSTIFICADA no cuentan. La lista refleja el último estado guardado, no un historial de correcciones.',
            'Prácticas distintas por raíz y con incluye_practica; sus estados de plan no se infieren del cierre de una sesión.',
            'Entregas, consumos, devoluciones, mermas y ajustes por fecha UTC convertida a hora local, separados por insumo/lote/unidad/tipo. No se reescriben movimientos.',
            'Existencias, activos y alertas son situación actual a la generación, no reconstrucción del mes consultado.',
            'Las declaraciones de participantes no acreditan asistencia ni personas únicas. Capacidad registrada sin unidad confirmada.',
            'Solo se cuentan solicitudes con seguimiento de práctica y sesiones de uso registradas; no se inventan ocurrencias de reservaciones recurrentes.',
            'Corte firmado disponible para exportar durante 24 horas. Actualizar genera otra consulta; no se conserva una copia permanente en el servidor.',
        ])


def estado_periodo(desde, hasta, generado):
    if generado < desde:
        return 'Periodo futuro'
    if generado < hasta:
        return 'Periodo en curso: resultados parciales'
    return ''


def comparativo(db, lab, mes, anio, usuario):
    limites(mes, anio)
    primero = ((mes - 1) // 4) * 4 + 1
    desde = dt.datetime(anio, primero, 1, tzinfo=ZONA)
    hasta = dt.datetime(anio + (primero == 9), 1 if primero == 9 else primero + 4, 1, tzinfo=ZONA)
    anterior = dt.datetime(anio - (primero == 1), 9 if primero == 1 else primero - 4, 1, tzinfo=ZONA)
    actual = generar(db, lab, mes, anio, usuario, (desde, hasta))
    previo = generar(db, lab, anterior.month, anterior.year, usuario, (anterior, desde))
    estado = estado_periodo(desde, hasta, dt.datetime.fromisoformat(actual['generado_en']))
    actual['comparacion'] = dict(actual=f'{desde.date()} a {(hasta - dt.timedelta(days=1)).date()}',
        anterior=f'{anterior.date()} a {(desde - dt.timedelta(days=1)).date()}',
        alcance='Cuatrimestres calendario.' + (f' {estado}. No se proyectan resultados futuros.' if estado else ''))
    tablas_actuales = actual['tablas']
    actual['tablas'] = {}
    for prefijo, reporte in [('actual', actual), ('anterior', previo)]:
        tablas = tablas_actuales if prefijo == 'actual' else reporte['tablas']
        for nombre, filas in tablas.items():
            if prefijo == 'anterior' and nombre.endswith('actuales'):
                continue
            actual['tablas'][f'{prefijo}_{nombre}'] = filas
    indicadores_actuales = actual['indicadores']
    actual['indicadores'] = []
    for prefijo, indicadores in [('actual', indicadores_actuales), ('anterior', previo['indicadores'])]:
        for x in indicadores:
            actual['indicadores'].append(dict(x, clave=f'{prefijo}_{x["clave"]}', titulo=f'{prefijo.capitalize()}: {x["titulo"]}'))
    return actual


def excel(reporte):
    wb = Workbook()
    wb.remove(wb.active)
    def hoja(nombre, filas):
        ws = wb.create_sheet(nombre[:31])
        columnas = list(dict.fromkeys(k for f in filas for k in f))
        ws.append(columnas or ['Sin registros'])
        for fila in filas:
            ws.append([fila.get(k) for k in columnas])
        for row in ws:
            for cell in row:
                # Los textos aportados por usuarios nunca se ejecutan como fórmulas.
                if isinstance(cell.value, str):
                    cell.data_type = 's'
        for cell in ws[1]:
            cell.font = Font(bold=True, color='FFFFFF')
            cell.fill = PatternFill('solid', fgColor='047857')
        ws.freeze_panes = 'A2'
        ws.auto_filter.ref = ws.dimensions
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = min(60, max(18, max(len(str(c.value or '')) for c in col) + 2))
    hoja('Identificación', [dict(campo=k, valor=str(v)) for k, v in reporte.items()
        if k in {'consulta_id', 'generado_en', 'generado_por', 'zona_horaria', 'laboratorio', 'periodo', 'comparacion'}])
    hoja('Resumen', [dict(indicador=x['titulo'], valor=x['valor'], unidad=x['unidad']) for x in reporte['indicadores']])
    hoja('Reglas', [dict(regla=x) for x in reporte['reglas']])
    for nombre, filas in reporte['tablas'].items():
        hoja(nombre, filas)
    buf = io.BytesIO()
    wb.save(buf); buf.seek(0)
    return buf
