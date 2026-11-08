# Cómo retomar SIGA

Este archivo y `CHANGELOG.md` conservan el contexto del proyecto junto al código. No dependen del historial de un chat ni de un equipo concreto. Solo quedan protegidos frente a la pérdida del equipo cuando sus commits se suben al repositorio remoto.

## Estado de referencia: 5 de noviembre de 2026

SIGA tiene un backend FastAPI/SQLAlchemy/Alembic y un frontend React con Vite. Las pruebas del frontend usan Jest. En Railway, ambos servicios se construyen desde la rama `codex/demo-railway`, con raíces `backend` y `frontend` del repositorio `MASTERGGD/LabControl`.

La clase académica (`ClaseDocente`) conserva asistencia, tema y bitácora. La sesión de laboratorio (`SesionClase`) conserva recepción, equipos e incidencias. Una sesión asociada a una reservación de una carga académica debe vincularse con la clase correspondiente del día. El cierre docente académico libera también el laboratorio vinculado. `SOLO_AULA` es la modalidad explícita que permite asistencia sin operación de equipos; no cambiarla automáticamente para eludir una reservación faltante.

El backend tiene almacenamiento persistente en `/siga-persistent`; los directorios de datos, respaldos, registros y adjuntos se configuran mediante variables de entorno. La base PostgreSQL tiene su propio volumen. No redesplegar una instalación con archivos únicamente efímeros antes de preservarlos y verificar sus hashes. No restaurar la base de datos como parte rutinaria de una publicación.

Las sesiones de autenticación persistentes se introdujeron con la migración `c4d5e6f7a8b9`. Los datos offline se cifran y su clave se desbloquea en memoria mediante el PIN. Una copia offline opcional bloqueada no debe convertir un éxito del servidor en un error de red ni duplicar operaciones confirmadas.

## Al volver desde otro equipo

1. Clonar el repositorio y revisar la rama y el último commit remoto. Leer este documento y el changelog antes de cambiar código.
2. Consultar `git status` y separar cambios existentes de la tarea actual. Obtener credenciales desde los servicios correspondientes; nunca desde archivos de este historial.
3. Verificar la configuración y los despliegues reales de Railway: un commit en GitHub no demuestra por sí solo qué versión está activa.
4. Instalar las dependencias del backend desde `backend/requirements.txt` y las del frontend con su lockfile. Ejecutar pruebas dirigidas al cambio y la compilación del frontend.
5. Revisar migraciones, persistencia y respaldo antes de publicar. Registrar el resultado real y los pendientes.

## Qué registrar por mejora

Fecha y módulo; problema observado; decisión y motivo; comportamiento nuevo; pruebas y sus resultados; estado de publicación y limitaciones. El código y sus diferencias quedan en Git; aquí se conserva la explicación. No reconstruir fechas o resultados que no estén documentados: marcar cualquier reconstrucción como tal.

## Límites conocidos

Durante la remediación de seguridad se encontraron 12 fallos en la suite general del backend que también se reprodujeron sobre la versión original aislada; no presentarlos como corregidos. La auditoría npm de ese momento dejó cinco avisos bajos en herramientas Jest/deepmerge. Estos resultados son históricos y deben verificarse de nuevo cuando se cambien esas áreas.

Una copia local de respaldo no sustituye un programa automático de respaldos externos. Los datos de producción y las copias de seguridad no están incluidos en el repositorio. No se ha realizado una prueba de penetración exhaustiva.


## Prácticas con varias sesiones (7 de noviembre de 2026)

La programación de prácticas se implementa en `services/programacion_practicas.py` y se expone bajo `/practicas-laboratorio/programacion`. Cada sesión conserva el registro `PracticaLaboratorio` existente; `practica_origen_id` relaciona las continuaciones con la primera sesión y `plan_estado` de esa raíz distingue planificación, pendiente de continuación y finalizada. No agrupar automáticamente las prácticas históricas. La migración aditiva es `e6f7a8b9c0d1`.

La confirmación valida todas las fechas y guarda en una transacción; los conflictos no deben dejar reservaciones parciales. Los bloqueos se toman en orden laboratorio, docente y grupo para programación; las transiciones de prácticas bloquean laboratorio, raíz y sesión. Las reservaciones puntuales nuevas se liberan al cerrar/cancelar; las recurrentes reutilizadas siguen perteneciendo al horario oficial de la materia. No liberar una reserva recurrente al finalizar una práctica.

Cada fecha requiere su preparación y mantiene materiales, incidentes y asistencia propios. Una sesión dentro del horario vincula su asistencia con `ClaseDocente`; las extraordinarias conservan su asistencia en la práctica y se consultan desde la agenda y el historial sin alterar el horario semanal. La clase vinculada se cierra desde la práctica para registrar materiales y avance. La última sesión cerrada no implica finalizar el conjunto: el docente decide continuar o finalizar. No cancelar automáticamente una sesión preparada con materiales entregados.

Los avisos de próximas prácticas se generan al verificar notificaciones mientras la aplicación está abierta; no son un envío externo garantizado con SIGA cerrado. Revisar `CHANGELOG.md` para el estado real de publicación y las comprobaciones realizadas.


## Propósito de las solicitudes en Química y Agroindustria (7 de noviembre de 2026)

Los accesos docentes del panel y la cuadrícula comparten `ProgramarPractica`. Primero se elige uso académico o individual. El académico exige carga propia activa con grupo; el individual exige objetivo y no se vincula a una carga ni genera asistencia académica. `incluye_practica` distingue una solicitud de espacio de una práctica que requiere preparación de materiales. Las sesiones sin materiales quedan listas para su ventana de inicio; las demás requieren preparación por el responsable. Se conserva el flujo técnico de otros laboratorios.

La migración aditiva `f7a8b9c0d1e2` agrega propósito, indicador de práctica y participantes a cada sesión. El propósito nulo de una sesión anterior sin carga significa SIN_VINCULACION; nunca inferir investigación a partir de la ausencia de carga. Su vinculación es explícita, conserva los datos anteriores y valida correspondencia y conflictos. No reclasificar ni cancelar reservaciones reales para verificar la publicación.

El modo Docente no hereda privilegios del rol adicional de responsable para evitar requisitos académicos. El inicio mediante la reservación reconoce su seguimiento propio y no debe permitir abrir una segunda sesión que omita la preparación o bitácora. Las fallas al consultar carga deben distinguirse de una respuesta vacía confirmada. Los avisos continúan dependiendo de que SIGA esté abierto; la revisión CORS no garantiza disponibilidad durante una interrupción del servicio.


## Resumen de agenda docente (7 de noviembre de 2026)

La agenda operativa excluye canceladas y cerradas, salvo la raíz cerrada con decisión explícita pendiente de continuación. Las sesiones en curso no se ocultan por tener fecha anterior. El resumen muestra como máximo tres actividades ordenadas por prioridad; las decisiones se agrupan por práctica en un desplegable. El historial conserva los registros terminales y se consulta mediante la vista HISTORIAL de la pantalla paginada de sesiones y prácticas. No volver a colocar un listado histórico completo encima del horario docente ni usar la existencia de una cancelación como alerta permanente.


## Reportes de Química y Agroindustria (7 de noviembre de 2026)

El reporte mensual y comparativo de estas categorías utiliza services/reporte_quimica.py mediante /reportes/quimica/mensual y /reportes/quimica/comparativo. Los demás laboratorios conservan el reporte anterior. Consultar docs/REPORTES_QUIMICA.md para fuentes, límites y aceptación. Se cuentan sesiones iniciadas y cierres reales por separado; las horas reales se recortan al periodo local, nunca se completa un cierre con fin_estimado. La agrupación de prácticas por raíz no sustituye los estados de plan existentes.

La exportación POST /reportes/quimica/excel recibe el mismo corte firmado que muestra la pantalla, revalida usuario y permisos vigentes y no consulta otra vez las cifras. La firma normaliza números enteros representados como float para tolerar el recorrido JSON por JavaScript. El corte expira en 24 horas, queda en memoria de la página y no se archiva permanentemente en el servidor. Actualizar genera otra consulta. No confundir este mecanismo con un archivo institucional histórico de reportes.

Los movimientos se agrupan por insumo/lote/unidad/tipo y su fecha; los materiales sin vínculo o fecha verificable se señalan como incompletos. Inventario, préstamos vencidos y alertas son situación actual de cualquier mes, separados de la actividad histórica. No se infiere asistencia desde PCs ni se equipara una declaración de participantes con personas únicas. La capacidad mantiene su número sin inventar su unidad. No se agregaron migraciones ni se modifican registros operativos al consultar.


## Gestión de disponibilidad y cancelaciones (8 de noviembre de 2026)

Química y Agroindustria tienen Administrar disponibilidad y reservaciones en Horarios y Reservaciones. Los bloqueos nuevos se guardan en BloqueoLaboratorio por rango de fechas inclusive y horas diarias con fin exclusivo; no modifican el horario semanal. Migración aditiva 91b8ac4e72f0, posterior a f7a8b9c0d1e2. Se validan rol efectivo y laboratorio asignado; el modo docente no hereda administración. El bloqueo rechaza conflictos sin cancelaciones automáticas, y conserva quién/motivo/fechas y desactivación.

Las cancelaciones de seguimiento permiten una sesión o esta y las siguientes de la misma práctica. Se validan todas antes de modificar: no cancelar iniciadas, cerradas ni con materiales entregados. Las reservas puntuales se liberan; las semanales se conservan para otras fechas. El docente recibe notificación interna y las acciones quedan en auditoría. Los bloqueos se comprueban al programar, reservar e iniciar; las reservas semanales nuevas que coinciden con bloqueos por fecha requieren optar por sesiones puntuales. El endpoint de bloqueo semanal antiguo rechaza Química y Agroindustria para impedir que omita esta revisión. Habilitar disponibilidad no restaura cancelaciones anteriores.


## Acceso unificado al bloqueo desde la cuadrícula (8 de noviembre de 2026)

En Química y Agroindustria, superadministrador y personal del laboratorio asignado comparten Administrar turno desde una celda libre: Editar horario semanal o Bloquear disponibilidad. El acceso directo Bloquear y el botón del detalle reservado abren el formulario por fechas existente, con horas precargadas y la próxima fecha del día seleccionado. El usuario confirma o cambia las fechas antes de guardar; abrir el formulario no envía una mutación. Se conserva la revisión de conflictos, materiales y sesiones en el backend. El modo docente y responsables de otro laboratorio no reciben estos accesos. El modal semanal antiguo queda fuera de este flujo químico. Cambiar de laboratorio limpia las selecciones abiertas.
