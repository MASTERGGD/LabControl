"""Vincula tutorías con su bloque y conserva revisiones para la edición."""
from collections import defaultdict
import datetime

from alembic import op
import sqlalchemy as sa

revision = 'o4p5q6r7s8t9'
down_revision = 'n3o4p5q6r7s8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('sesiones_tutoria') as batch:
        batch.add_column(sa.Column('carga_docente_id', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('fecha_programada', sa.Date(), nullable=True))
        batch.add_column(sa.Column('motivo_extraordinaria', sa.Text(), nullable=True))
        batch.add_column(sa.Column('revision', sa.Integer(), nullable=False, server_default='1'))
        batch.create_foreign_key('fk_tutoria_carga', 'cargas_docentes', ['carga_docente_id'], ['id'])
        batch.create_unique_constraint('uq_tutoria_carga_fecha', ['carga_docente_id', 'fecha_programada'])

    # Recuperar solo coincidencias históricas inequívocas. No cambiar fechas.
    bind = op.get_bind()
    cargas = bind.execute(sa.text("""SELECT c.id, c.docente_id, c.grupo_tutorado_id,
        c.dia_semana, c.hora_inicio, c.hora_fin FROM cargas_docentes c
        JOIN grupos_tutorados g ON g.id = c.grupo_tutorado_id
        JOIN periodos_escolares p ON p.id = c.periodo_id
        WHERE c.tipo_actividad = 'TUTORIA' AND c.activo = true AND c.estado = 'ACTIVO'
        AND g.periodo = p.clave""")).mappings().all()
    sesiones = bind.execute(sa.text("""SELECT s.id, s.tutor_id, s.grupo_tutorado_id, s.fecha, s.hora_inicio
        FROM sesiones_tutoria s WHERE s.tipo_sesion = 'GRUPAL'
        AND NOT EXISTS (SELECT 1 FROM programaciones_sesion_tutoria p
                        WHERE p.sesion_id = s.id AND p.fecha_programada <> s.fecha)""")).mappings().all()
    coincidencias = defaultdict(list)
    for s in sesiones:
        fecha = datetime.date.fromisoformat(str(s['fecha']))
        hora = str(s['hora_inicio'])[:5] if s['hora_inicio'] else None
        opciones = [c for c in cargas if c['docente_id'] == s['tutor_id']
                    and c['grupo_tutorado_id'] == s['grupo_tutorado_id']
                    and c['dia_semana'] == fecha.weekday()
                    and hora and c['hora_inicio'] <= hora < c['hora_fin']]
        if len(opciones) == 1:
            coincidencias[(opciones[0]['id'], fecha)].append(s['id'])
    for (carga, fecha), ids in coincidencias.items():
        if len(ids) == 1:
            bind.execute(sa.text('UPDATE sesiones_tutoria SET carga_docente_id=:carga, fecha_programada=:fecha WHERE id=:id'),
                         {'carga': carga, 'fecha': fecha, 'id': ids[0]})


def downgrade():
    with op.batch_alter_table('sesiones_tutoria') as batch:
        batch.drop_constraint('uq_tutoria_carga_fecha', type_='unique')
        batch.drop_constraint('fk_tutoria_carga', type_='foreignkey')
        for name in ('revision', 'motivo_extraordinaria', 'fecha_programada', 'carga_docente_id'):
            batch.drop_column(name)
