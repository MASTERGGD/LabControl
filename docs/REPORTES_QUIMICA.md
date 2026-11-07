# Reportes de Química y Agroindustria

Implementación del 7 de noviembre de 2026. El estado de publicación y sus comprobaciones se registran en CHANGELOG.md.

## Fuentes y reglas verificadas

| Indicador / sección | Fuente real | Regla |
| --- | --- | --- |
| Sesiones programadas | PracticaLaboratorio.fecha_sesion, estado; Reservacion.laboratorio_id | Fecha prevista dentro del intervalo. Los estados mostrados son los existentes, al consultar. No se crean ocurrencias a partir de reservas recurrentes. |
| Prácticas distintas programadas | PracticaLaboratorio.practica_origen_id, id, incluye_practica | Una raíz por práctica, excluyendo solicitudes de espacio sin práctica. Una continuación no suma otra raíz. |
| Estado del conjunto | Raíz de PracticaLaboratorio.plan_estado | Sin inferir conclusión a partir del cierre de una sesión. Un valor ausente se muestra NO_REGISTRADO. |
| Ejecución | PracticaLaboratorio.iniciada_en, cerrada_en | Inicio real determina el conteo de sesiones iniciadas y su asistencia. Cierres reales tienen indicador independiente. |
| Horas reales | Campos anteriores; SesionClase.inicio, fin_real para sesiones sin seguimiento | Intervalo real recortado por los límites del periodo local. Nunca fin_estimado. Sin cierre o con fechas invertidas: duración no determinada y regularización. Son horas-sesión, no ocupación neta si existen traslapes. |
| Sesiones anteriores | SesionClase | Se excluye de la suma una sesión con reservación y fecha local de inicio ya representadas por una práctica iniciada. Los registros sin seguimiento se identifican como información incompleta; no se infiere asistencia de AsignacionPC. |
| Alumnos únicos | AsistenciaPractica.matricula, estado | Matrículas no vacías normalizadas a mayúsculas, distintas en el periodo; PRESENTE y RETARDO. |
| Asistencias acumuladas | AsistenciaPractica.id, estado | Una por registro presente o con retardo, dentro de sesiones iniciadas en el periodo. FALTA y JUSTIFICADA no suman. Se utiliza el estado guardado en prácticas, no se reconstruye el historial de correcciones académicas. |
| Participantes declarados | PracticaLaboratorio.participantes | Texto informativo, sin conteo nominal ni inferencia de asistentes externos o personas únicas. |
| Propósito | PracticaLaboratorio.proposito; Reservacion.carga_docente_id | Se conserva el propósito declarado. Si falta, una carga vinculada identifica uso académico; sin ambos, SIN_VINCULACION. Individual no se convierte en investigación. |
| Materiales | MovimientoInsumoLaboratorio.tipo, cantidad, creado_en, insumo_id; InsumoLaboratorio.nombre, lote, unidad | Se agrupan por ID de insumo/lote/unidad/tipo; ENTREGA, CONSUMO, DEVOLUCION, MERMA y AJUSTE se mantienen distintos. Fecha del movimiento, no fecha de programación. |
| Material sin insumo | MaterialPractica.insumo_id y cantidades declaradas | Se muestra en información incompleta con cantidades y unidad; sin una fecha de movimiento verificable no se imputa como consumo del mes. |
| Residuos | ResiduoPractica.creado_en, descripcion, clasificacion, cantidad, unidad, destino | Bitácora y agrupación por descripción/clasificación/unidad, sin conversiones automáticas. |
| Incidentes | IncidentePractica e Incidente | Fecha de registro; se excluye el espejo de inventario con origen PRACTICA del total mensual para evitar duplicación. El seguimiento actual de un incidente enlazado utiliza el registro de inventario. |
| Existencias actuales | InsumoLaboratorio activo, cantidad_disponible, stock_minimo, caduca_en | Existencia baja si disponible <= mínimo; caducado si la fecha precede al día local de consulta. Incluye material, lote y unidad. No reconstruye existencias pasadas. |
| Activos actuales | Activo.laboratorio_id, activo, estado | Todos los activos vigentes asignados, con estado y categoría; sin asumir que todos son instrumental ni PCs. |
| Préstamos vencidos actuales | Prestamo.estado, fecha_retorno_esperada; Activo.laboratorio_id | Activos o vencidos de cualquier mes que sigan vencidos al consultar. |
| Capacidad | Laboratorio.capacidad | Se conserva el número, con unidad pendiente de confirmar; no se transforma en alumnos, mesas o equipos. |

Los timestamps sin zona de la base se interpretan como UTC, conforme a las funciones de creación existentes. Los límites se convierten a America/Mexico_City; el extremo final es exclusivo. Una sesión de 23:00 a 01:00 entre meses aporta una sesión al mes de inicio y una hora a cada mes. Una cancelación no borra ejecución, asistencia ni movimientos existentes. No se modifica el flujo operativo ni se corrigen datos al consultar.

El comparativo utiliza el mismo cálculo sobre cuatrimestres calendario enero–abril, mayo–agosto y septiembre–diciembre, seleccionados por mes/año de referencia, y el inmediatamente anterior. Deduplica alumnos y prácticas sobre todo el intervalo, sin sumar totales mensuales de personas. Avisa que el periodo en curso es parcial. El inventario actual se muestra una sola vez y separado de la comparación histórica; no se interpreta como inventario del cuatrimestre anterior.

## Coherencia de pantalla y Excel

GET /reportes/quimica/mensual y /reportes/quimica/comparativo devuelven reporte y firma. El corte contiene ID de consulta, usuario, filtros, zona horaria, fecha y hora, indicadores y todos los registros fuente usados. Cada indicador abre su detalle paginado; las secciones de materiales, residuos e inventario conservan sus registros separados.

POST /reportes/quimica/excel recibe ese mismo corte firmado, verifica integridad, antigüedad máxima de 24 horas, propietario y permisos actuales del laboratorio. No vuelve a calcular sobre una base que pudo cambiar desde la consulta. Resumen y hojas de respaldo utilizan exactamente los resultados enviados originalmente por el servidor; los textos se escriben como texto, no como fórmulas. La exportación se registra en auditoría.

El corte permanece en la memoria de la página. No constituye un archivo histórico permanente del servidor ni un bloqueo transaccional de toda la base. Actualizar, cambiar filtros o recargar genera otra consulta. Si se desea conservación institucional permanente, requiere definir almacenamiento, retención y acceso antes de implementarlo. No se agregaron migraciones para esta entrega.

## Aceptación automatizada

backend/tests/test_reporte_quimica.py cubre multisesión, estado del conjunto, repetición de matrícula, faltas/retardos, duración sin cierre, cruce de mes y zona horaria, movimientos y residuos posteriores a una cancelación, separación de unidades, ajustes posteriores, estado actual frente a mes histórico, sesiones anteriores y duplicación, incidentes espejo, Excel estable tras cambiar la base, textos de fórmula, manipulación y expiración del corte, propietario, permisos por laboratorio, filtros inválidos y comparativo.

frontend/src/components/ReporteQuimica.test.jsx cubre consulta explícita, detalle de fuentes, alcance de alertas, descarga del mismo corte sin recalcular, respuestas tardías, errores sin falsos ceros, comparativo químico y paginación de detalle. frontend/src/pages/admin/ReportesQuimica.test.jsx comprueba la sustitución de las consultas de cómputo en ambas pestañas para Química. Los demás laboratorios conservan su reporte anterior.

Pendientes de revisión con responsables: unidad oficial de capacidad, completitud de registros antiguos, correspondencia de correcciones académicas posteriores con asistencia de prácticas y necesidad de archivo permanente de reportes. La comprobación pública del despliegue no sustituye una revisión visual autenticada con datos reales.
