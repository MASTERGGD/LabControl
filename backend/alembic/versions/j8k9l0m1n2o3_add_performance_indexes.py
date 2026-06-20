"""add performance indexes for production postgres

Revision ID: j8k9l0m1n2o3
Revises: i7j8k9l0m1n2
Create Date: 2026-06-16
"""

from alembic import op


revision = "j8k9l0m1n2o3"
down_revision = "i7j8k9l0m1n2"
branch_labels = None
depends_on = None


INDEXES = [
    # Usuarios y permisos
    ("ix_usuarios_rol_activo", "usuarios", ["rol", "activo"]),
    ("ix_usuarios_laboratorio_activo", "usuarios", ["laboratorio_id", "activo"]),
    ("ix_usuarios_departamento_activo", "usuarios", ["departamento_id", "activo"]),
    ("ix_usuario_permisos_user_perm_activo", "usuario_permisos", ["usuario_id", "permiso", "activo"]),
    ("ix_usuario_permisos_depto_perm_activo", "usuario_permisos", ["departamento_id", "permiso", "activo"]),

    # Laboratorios, horarios y reservaciones
    ("ix_laboratorios_activo_categoria", "laboratorios", ["activo", "categoria"]),
    ("ix_computadoras_lab_activa_estado", "computadoras", ["laboratorio_id", "activa", "estado"]),
    ("ix_horarios_lab_cuatri_dia", "horarios_disponibles", ["laboratorio_id", "cuatrimestre", "dia_semana"]),
    ("ix_horarios_lab_activo_cuatri", "horarios_disponibles", ["laboratorio_id", "activo", "cuatrimestre"]),
    ("ix_reservaciones_lab_cuatri_estado", "reservaciones", ["laboratorio_id", "cuatrimestre", "estado"]),
    ("ix_reservaciones_docente_cuatri_estado", "reservaciones", ["docente_id", "cuatrimestre", "estado"]),
    ("ix_reservaciones_horario_estado", "reservaciones", ["horario_id", "estado"]),
    ("ix_bloqueos_slot_horario_activo", "bloqueos_slot", ["horario_id", "activo"]),
    ("ix_solicitudes_conflicto_res_estado", "solicitudes_conflicto", ["reservacion_id", "estado"]),

    # Sesiones de laboratorio
    ("ix_sesiones_lab_estado_inicio", "sesiones_clase", ["laboratorio_id", "estado", "inicio"]),
    ("ix_sesiones_docente_estado_inicio", "sesiones_clase", ["docente_id", "estado", "inicio"]),
    ("ix_sesiones_reservacion_estado", "sesiones_clase", ["reservacion_id", "estado"]),
    ("ix_asignaciones_sesion_pc", "asignaciones_pc", ["sesion_id", "computadora_id"]),
    ("ix_asignaciones_pc_hora", "asignaciones_pc", ["computadora_id", "hora_asignacion"]),
    ("ix_asignaciones_sesion_matricula", "asignaciones_pc", ["sesion_id", "alumno_matricula"]),
    ("ix_observaciones_sesion_atendida", "observaciones_pc", ["sesion_id", "atendida"]),
    ("ix_observaciones_pc_atendida", "observaciones_pc", ["computadora_id", "atendida"]),

    # Inventario, prestamos e incidencias
    ("ix_activos_lab_admin_activo", "activos", ["laboratorio_id", "estado_admin", "activo"]),
    ("ix_activos_depto_admin_activo", "activos", ["departamento_id", "estado_admin", "activo"]),
    ("ix_activos_categoria_estado_activo", "activos", ["categoria", "estado", "activo"]),
    ("ix_activos_ubicacion_activo", "activos", ["ubicacion_id", "activo"]),
    ("ix_activos_responsable_activo", "activos", ["responsable_id", "activo"]),
    ("ix_movimientos_activo_fecha", "movimientos_inventario", ["activo_id", "fecha_solicitud"]),
    ("ix_movimientos_estado_fecha", "movimientos_inventario", ["estado", "fecha_solicitud"]),
    ("ix_bajas_estado_fecha", "solicitudes_baja_inventario", ["estado", "fecha_solicitud"]),
    ("ix_levantamientos_lab_estado_fecha", "levantamientos_inventario", ["laboratorio_id", "estado", "fecha_inicio"]),
    ("ix_levantamientos_depto_estado_fecha", "levantamientos_inventario", ["departamento_id", "estado", "fecha_inicio"]),
    ("ix_revision_levant_activo_fecha", "revisiones_levantamiento_inventario", ["activo_id", "fecha_revision"]),
    ("ix_revision_levantamiento_activo", "revisiones_levantamiento_inventario", ["levantamiento_id", "activo_id"]),
    ("ix_prestamos_activo_estado_fecha", "prestamos", ["activo_id", "estado", "fecha_salida"]),
    ("ix_prestamos_estado_retorno", "prestamos", ["estado", "fecha_retorno_esperada"]),
    ("ix_prestamos_solicitante_fecha", "prestamos", ["solicitante_id_escolar", "fecha_salida"]),
    ("ix_incidentes_lab_estado_fecha", "incidentes", ["laboratorio_id", "estado", "fecha_reporte"]),
    ("ix_incidentes_activo_estado_fecha", "incidentes", ["activo_id", "estado", "fecha_reporte"]),
    ("ix_incidentes_pc_estado_fecha", "incidentes", ["computadora_id", "estado", "fecha_reporte"]),
    ("ix_incidentes_reportado_fecha", "incidentes", ["reportado_por_id", "fecha_reporte"]),
    ("ix_incidentes_origen", "incidentes", ["origen", "origen_id"]),
    ("ix_incidente_seg_incidente_fecha", "incidente_seguimientos", ["incidente_id", "creado_en"]),
    ("ix_mantenimientos_lab_estado_fecha", "mantenimientos_preventivos", ["laboratorio_id", "estado", "fecha_programada"]),
    ("ix_mantenimientos_activo_estado_fecha", "mantenimientos_preventivos", ["activo_id", "estado", "fecha_programada"]),

    # Espacios institucionales
    ("ix_espacios_activo_tipo", "espacios_institucionales", ["activo", "tipo"]),
    ("ix_solicitudes_espacio_fecha_estado", "solicitudes_espacio", ["espacio_id", "fecha", "estado"]),
    ("ix_solicitudes_estado_fecha", "solicitudes_espacio", ["estado", "fecha"]),
    ("ix_solicitudes_solicitante_fecha", "solicitudes_espacio", ["solicitante_id", "fecha"]),
    ("ix_solicitudes_departamento_fecha", "solicitudes_espacio", ["departamento_id", "fecha"]),

    # Comunicados
    ("ix_comunicados_estado_fijado_pub", "comunicados", ["estado", "fijado", "fecha_publicacion"]),
    ("ix_comunicados_estado_creado", "comunicados", ["estado", "creado_en"]),
    ("ix_comunicados_autor_creado", "comunicados", ["autor_id", "creado_en"]),
    ("ix_comunicados_depto_estado_creado", "comunicados", ["departamento_emisor_id", "estado", "creado_en"]),
    ("ix_comunicados_categoria_prioridad", "comunicados", ["categoria", "prioridad"]),
    ("ix_com_dest_tipo_ref", "comunicado_destinatarios", ["tipo_destinatario", "destinatario_ref", "comunicado_id"]),
    ("ix_com_lecturas_user_leido", "comunicado_lecturas", ["usuario_id", "leido_en"]),
    ("ix_com_respuestas_estado_creado", "comunicado_respuestas", ["estado", "creado_en"]),
    ("ix_com_resp_mensajes_resp_creado", "comunicado_respuesta_mensajes", ["respuesta_id", "creado_en"]),
    ("ix_com_respaldos_creado", "comunicado_respaldos", ["creado_en"]),

    # Adeudos y auditoria
    ("ix_adeudos_lab_estado_fecha", "adeudos", ["laboratorio_id", "estado", "fecha_reporte"]),
    ("ix_adeudos_persona_tipo_id_fecha", "adeudos", ["persona_tipo", "persona_identificador", "fecha_reporte"]),
    ("ix_adeudos_cuatri_estado_fecha", "adeudos", ["cuatrimestre", "estado", "fecha_reporte"]),
    ("ix_adeudos_origen_estado", "adeudos", ["origen_tipo", "estado"]),
    ("ix_adeudos_incidente", "adeudos", ["incidente_id"]),
    ("ix_audit_logs_user_timestamp", "audit_logs", ["usuario_id", "timestamp"]),
    ("ix_audit_logs_recurso_id_timestamp", "audit_logs", ["recurso", "recurso_id", "timestamp"]),
    ("ix_audit_logs_accion_timestamp", "audit_logs", ["accion", "timestamp"]),
    ("ix_audit_logs_exito_timestamp", "audit_logs", ["exito", "timestamp"]),

    # Catalogos
    ("ix_catalogo_alumnos_periodo_grupo", "catalogo_alumnos", ["periodo", "carrera", "grupo", "activo"]),
    ("ix_catalogo_alumnos_usuario_activo", "catalogo_alumnos", ["usuario_id", "activo"]),
    ("ix_catalogo_materias_periodo_carrera", "catalogo_materias", ["periodo", "carrera", "activo"]),
    ("ix_catalogo_materias_cuatri_activo", "catalogo_materias", ["cuatrimestre_oficial", "activo"]),
    ("ix_catalogo_carreras_activo_nombre", "catalogo_carreras", ["activo", "nombre"]),
]


def upgrade():
    for name, table, columns in INDEXES:
        op.create_index(name, table, columns, unique=False)


def downgrade():
    for name, table, _columns in reversed(INDEXES):
        op.drop_index(name, table_name=table)
