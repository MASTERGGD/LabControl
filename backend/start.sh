#!/bin/sh
echo "=== LabControl UTECAN — Backend ==="
echo "Limpiando caché de bytecode..."
find /app -name "*.pyc" -delete 2>/dev/null
find /app -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
# Eliminar carpeta websockets/ local que shadea el paquete PyPI
rm -rf /app/websockets 2>/dev/null || true
echo "Creando directorio de datos..."
mkdir -p /app/data
echo "Arrancando servidor (wsproto WebSocket)..."
# --reload desactivado: watchfiles + WSL2 + NTFS = crash garantizado.
# Para ver cambios en desarrollo: docker-compose restart backend
exec uvicorn main:app --host 0.0.0.0 --port 8000 --ws wsproto
