# Bitacora de auditoria: retencion y almacenamiento

## Objetivo

La bitacora (`audit_logs`) conserva trazabilidad de acciones relevantes sin convertir la base operativa en un archivo historico infinito.

El criterio recomendado es:

- Guardar en la base principal solo la ventana operativa reciente.
- Archivar registros antiguos en archivos comprimidos verificables.
- Mantener indices para consultas frecuentes.
- No registrar ruido de interfaz como clics, modales o navegacion simple.

## Configuracion

Variables disponibles:

```env
AUDIT_RETENTION_DAYS=365
AUDIT_ARCHIVE_ENABLED=true
AUDIT_ARCHIVE_DIR=data/audit_archives
AUDIT_ARCHIVE_BATCH_SIZE=5000
```

Valores recomendados para piloto institucional:

- `AUDIT_RETENTION_DAYS=365`: suficiente para revisar el ciclo escolar y auditorias recientes.
- `AUDIT_ARCHIVE_BATCH_SIZE=5000`: evita operaciones demasiado grandes.
- `AUDIT_ARCHIVE_DIR=data/audit_archives`: debe incluirse en respaldos del sistema.

## Endpoints administrativos

Solo `SUPER_ADMIN` puede ejecutar estas operaciones.

Consultar estado:

```http
GET /auditoria/retencion
```

Simular archivado sin borrar:

```http
POST /auditoria/retencion/archivar?dry_run=true
```

Archivar y limpiar la tabla operativa:

```http
POST /auditoria/retencion/archivar?dry_run=false
```

Opcionalmente:

```http
POST /auditoria/retencion/archivar?dry_run=false&dias_retencion=365&limite=5000
```

## Formato de archivo

Los registros antiguos se guardan como:

```text
data/audit_archives/audit_logs_YYYYMMDD_HHMMSS_IDINICIO_IDFIN.jsonl.gz
```

Cada linea contiene un registro JSON independiente. El endpoint devuelve:

- ruta del archivo
- cantidad archivada
- cantidad eliminada de la tabla operativa
- `sha256` para verificar integridad
- tamano en bytes

## Restauracion / consulta historica

El archivo historico no se reimporta automaticamente a `audit_logs`, porque eso volveria a inflar la tabla operativa. Para una auditoria historica se recomienda:

1. Descargar o localizar el `.jsonl.gz`.
2. Verificar el `sha256`.
3. Consultarlo con herramientas externas o cargarlo temporalmente en una tabla auxiliar.
4. Mantener `audit_logs` como bitacora operativa reciente.

## Indices

La tabla mantiene indices compuestos para los filtros mas usados:

- usuario + fecha
- recurso + recurso_id + fecha
- accion + fecha
- exito + fecha

Esto mejora consultas, exportaciones y expedientes sin depender de barridos completos cuando el sistema crezca.
