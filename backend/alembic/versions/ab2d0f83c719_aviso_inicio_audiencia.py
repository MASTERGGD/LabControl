"""Permite publicar avisos de inicio para todos los perfiles."""
from alembic import op
import sqlalchemy as sa

revision = "ab2d0f83c719"
down_revision = "da08d4151ba2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("aviso_inicio_docente", sa.Column(
        "audiencia", sa.String(10), nullable=False, server_default="DOCENTES",
    ))


def downgrade():
    op.drop_column("aviso_inicio_docente", "audiencia")
