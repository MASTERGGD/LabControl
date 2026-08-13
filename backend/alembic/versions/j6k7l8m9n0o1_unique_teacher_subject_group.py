"""Evita que dos docentes reclamen la misma materia y grupo."""
from alembic import op


revision = "j6k7l8m9n0o1"
down_revision = "i5j6k7l8m9n0"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE OR REPLACE FUNCTION validar_docente_materia_grupo()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.activo AND NEW.tipo_actividad = 'CLASE'
               AND NEW.materia_id IS NOT NULL AND NEW.grupo_academico_id IS NOT NULL THEN
                PERFORM pg_advisory_xact_lock(
                    hashtextextended(
                        NEW.periodo_id::text || ':' || NEW.materia_id::text || ':' || NEW.grupo_academico_id::text,
                        0
                    )
                );
                IF EXISTS (
                   SELECT 1 FROM cargas_docentes existente
                   WHERE existente.id <> NEW.id
                     AND existente.activo
                     AND existente.tipo_actividad = 'CLASE'
                     AND existente.periodo_id = NEW.periodo_id
                     AND existente.materia_id = NEW.materia_id
                     AND existente.grupo_academico_id = NEW.grupo_academico_id
                     AND existente.docente_id <> NEW.docente_id
                ) THEN
                    RAISE EXCEPTION USING
                        ERRCODE = '23505',
                        CONSTRAINT = 'uq_docente_materia_grupo',
                        MESSAGE = 'La materia y el grupo ya pertenecen a otro docente';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_validar_docente_materia_grupo
        BEFORE INSERT OR UPDATE OF periodo_id, materia_id, grupo_academico_id, docente_id, activo, tipo_actividad
        ON cargas_docentes
        FOR EACH ROW EXECUTE FUNCTION validar_docente_materia_grupo();
    """)


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS trg_validar_docente_materia_grupo ON cargas_docentes")
    op.execute("DROP FUNCTION IF EXISTS validar_docente_materia_grupo()")
