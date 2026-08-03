#!/bin/sh
echo "=== LabControl UTECAN — Backend ==="

echo "Limpiando cache de bytecode..."
find /app -name "*.pyc" -delete 2>/dev/null
find /app -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
# Eliminar carpeta websockets/ local que shadea el paquete PyPI
rm -rf /app/websockets 2>/dev/null || true

echo "Creando directorio de datos..."
mkdir -p /app/data

# -- Esperar a PostgreSQL (solo si DATABASE_URL apunta a postgres) -------------
# Si se usa SQLite esta seccion se salta automaticamente.
if echo "${DATABASE_URL:-}" | grep -Eq "postgres(ql)?"; then
  echo "Esperando a PostgreSQL..."
  DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
  DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
  DB_PORT=${DB_PORT:-5432}
  RETRIES=30
  until pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null || \
        python3 -c "
import socket, sys
try:
    s = socket.create_connection(('$DB_HOST', $DB_PORT), timeout=2)
    s.close()
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; do
    RETRIES=$((RETRIES - 1))
    if [ "$RETRIES" -le 0 ]; then
      echo "ERROR: PostgreSQL no respondio a tiempo -- abortando."
      exit 1
    fi
    echo "  PostgreSQL no listo, reintentando en 2s... ($RETRIES intentos restantes)"
    sleep 2
  done
  echo "PostgreSQL listo."

  # El codigo y el esquema deben avanzar juntos. Si una migracion falla, no se
  # inicia la API con un modelo incompatible (eso termina apareciendo como 500/CORS).
  echo "Aplicando migraciones de base de datos..."
  if ! alembic upgrade head; then
    echo "ERROR: No fue posible aplicar las migraciones -- abortando despliegue."
    exit 1
  fi
  echo "Migraciones aplicadas."
fi

PORT="${PORT:-8000}"
echo "Arrancando servidor (wsproto WebSocket) en puerto ${PORT}..."
# --reload desactivado: watchfiles + WSL2 + NTFS = crash garantizado.
# Para ver cambios en desarrollo: docker-compose restart backend
exec uvicorn main:app --host 0.0.0.0 --port "$PORT" --ws wsproto
