# Changelog — LabControl UTECAN

Historial de desarrollo del sistema. Sigue [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Preparado, sin publicar] — Contadores y filtros coherentes en sesiones e historial — 2026-11-07

### Problema y comportamiento resultante
Las pestañas mostraban el total de registros de la cuenta aunque los filtros produjeran cero resultados. Ahora búsqueda, periodo, fechas y estado se aplican antes de calcular ambos contadores y la lista. Cambiar de pestaña conserva los filtros aplicados sin aplicar borradores; el selector mantiene visibles todos los estados y se avisa cuando hay cambios pendientes de aplicar.

El periodo dejaba fuera formatos equivalentes al comparar el texto exactamente. La consulta reconoce claves equivalentes con espacios o guiones, agrupa sus opciones y da prioridad al periodo escolar formal cuando está vinculado. La normalización se aplica a la consulta y no reescribe los periodos guardados. Los permisos y el ámbito por docente/laboratorio se mantienen.

Con cero coincidencias se muestra 0 resultados, un mensaje específico y acceso a Limpiar filtros; se oculta la paginación vacía. Durante carga o error los contadores muestran un guion en lugar de cero confirmado. No se interpreta una búsqueda sin coincidencias como ausencia total de actividad. Aplicar/limpiar filtros cierra el detalle abierto por enlace para que no se mezcle con los resultados filtrados.

### Validación y estado
38 suites y 156 pruebas frontend aprobadas; 45 pruebas backend dirigidas aprobadas. Tres regresiones frontend verifican historial en cero, eliminación de paginación vacía, recuperación al limpiar, conservación de filtros aplicados frente a borradores y contadores no disponibles durante carga/error. Siete casos backend adicionales cubren conteos filtrados, cambio de vista, formatos equivalentes, prioridad del periodo formal y deduplicación de opciones. Compilación Vite aprobada con los avisos existentes de tamaño e importación mixta de offlineStore; un primer intento falló en Tailwind (blocklist) y el reintento sin cambios aprobó. Pruebas con datos ficticios y base aislada.

Preparado localmente; pendiente publicación, comprobación del despliegue y revisión autenticada del filtro reportado por el docente. Sin migraciones ni cambios de registros reales. Cambios ajenos conservados y excluidos.

---

## [Preparado, sin publicar] — Agenda docente compacta y cancelaciones en historial — 2026-11-07

### Problema y comportamiento resultante
La consulta de agenda incluía cancelaciones mientras su fecha siguiera siendo futura, y la interfaz mostraba todas las filas sobre el encabezado del horario. La agenda operativa ahora excluye canceladas y sesiones cerradas, conserva las sesiones en curso aunque su fecha sea anterior y muestra hasta tres actividades, priorizando en curso y hoy antes de próximas fechas. La consulta completa sigue disponible desde el enlace con contador.

Las prácticas cerradas pendientes de decidir continuación se agrupan por práctica en un bloque desplegable separado; una cancelada no reaparece por conservar un indicador de continuación. El historial conserva canceladas y cerradas sin eliminar registros. Los enlaces abren directamente Activas o Historial en la consulta paginada existente, con sus filtros y búsqueda; en el historial académico se muestra solo un acceso compacto al historial de laboratorio. El encabezado de cada pantalla precede al resumen. Sin próximas actividades se muestra una franja breve; los errores mantienen reintento y no se presentan como ausencia confirmada.

Las cancelaciones exitosas desde los dos controles de la cuadrícula actualizan la agenda y muestran durante seis segundos una confirmación de liberación. El sondeo y el enfoque de ventana actualizan los datos sin conservar respuestas tardías de otro periodo. Sin cambios de reservaciones reales, permisos, esquema ni asistencia; se modifica la consulta y presentación.

### Validación y estado
38 suites y 153 pruebas frontend aprobadas; compilación Vite aprobada con los avisos existentes de tamaño e importación mixta de offlineStore. 40 pruebas backend dirigidas aprobadas. Siete pruebas frontend nuevas cubren 30 actividades con tres filas, orden por prioridad, canceladas fuera del resumen, decisiones agrupadas, error/reintento, confirmación temporal y acceso directo al historial; tres pruebas backend nuevas verifican exclusión de terminales, conservación del historial, decisión solo para una raíz cerrada y permanencia de sesiones antiguas en curso. Pruebas con datos ficticios y base aislada.

Preparado localmente; pendiente publicación y verificación del despliegue, además de revisión visual autenticada del docente. Sin migraciones. Cambios ajenos conservados y excluidos.

---

## [Preparado, sin publicar] — Solicitud académica o individual de laboratorio — 2026-11-07

### Problema y comportamiento resultante
En Química y Agroindustria coexistían la programación vinculada a carga y un formulario anterior que permitía solicitar una práctica usando solamente el catálogo. Además, el formulario dejaba llenar datos sin materias y confundía fallos de consulta con una carga vacía. Ambos accesos docentes usan ahora una solicitud que primero exige elegir propósito: clase/práctica académica o investigación/trabajo individual. El uso académico requiere materia y grupo activos de la propia carga; sin carga confirmada solo se muestra el requisito y un acceso al horario. Un fallo de consulta muestra reintento y no afirma ausencia de materias. El rol adicional de responsable no sustituye esos requisitos en modo Docente.

El uso individual solicita título y objetivo, admite participantes opcionales y una o varias fechas editables, sin exigir carga ni crear ClaseDocente o asistencia de alumnos. En ambos usos se puede pedir solo el espacio o activar una práctica con materiales y preparación por fecha. Se conserva la comprobación atómica de laboratorio, docente, grupo cuando corresponde, bloqueos, calendario y continuidad. La agenda e historial distinguen el propósito; las sesiones individuales registran resultados y bitácora. Los accesos desde reservaciones con seguimiento dirigen a su actividad y el inicio alternativo no permite saltarse sus controles. Se preserva el flujo técnico existente de los demás laboratorios.

El servidor rechaza las solicitudes docentes académicas de estos laboratorios mediante el formulario anterior y evita cambiar su identidad mediante una edición. Los registros anteriores sin carga se conservan como sin vinculación académica; pueden vincularse explícitamente a una carga coincidente, comprobando los conflictos, o cancelarse mediante el flujo existente. No se convierten automáticamente en investigación ni se borran registros. La migración aditiva f7a8b9c0d1e2 deja propósito y participantes nulos en registros anteriores.

### Validación y estado
37 suites y 146 pruebas frontend aprobadas; compilación Vite aprobada con los avisos existentes de tamaño e importación mixta de offlineStore. 37 pruebas backend dirigidas aprobadas; se verifican uso individual sin carga/asistencia académica, solo espacio académico, objetivo obligatorio, conflictos sin guardados parciales, roles, bloqueo de la vía anterior, vinculación explícita, inicio alternativo y migración conservando datos. Comprobación ampliada previa: 52 aprobadas y un fallo de cancelación administrativa sin motivo; se reprodujo ese mismo fallo en una copia aislada de ced4736, sin esta mejora. No se presenta como corregido.

Preflight y rechazo anónimo conservan CORS en la aplicación real. No se atribuye la captura previa de Network Error a una causa nueva ni se afirma corregir toda interrupción de red; la interfaz distingue el fallo y permite reintentar. Confirmados los volúmenes persistentes de archivos y PostgreSQL y una única cabeza Alembic. Preparado localmente; pendiente publicación, verificación de migración y revisión visual autenticada. Pruebas con datos ficticios y base aislada; sin cambios a las reservaciones reales del usuario. Cambios ajenos conservados y excluidos.

---

## [7d7b6ac] — Prácticas por sesiones vinculadas a la materia — 2026-11-07

### Problema y comportamiento resultante
La práctica tenía una sola fecha y se operaba desde un módulo separado, sin continuidad entre sesiones ni acceso contextual desde la jornada docente. Se permite planificar hasta 30 fechas por operación (60 por práctica), tomando los bloques de una misma materia y grupo, todos sus días o días elegidos, y ajustar sesiones fuera del horario habitual. La revisión muestra los conflictos por fecha; la confirmación vuelve a validar laboratorio, docente, grupo, bloqueos, calendario, periodo y pertenencia, y guarda todas las sesiones en una sola transacción. Se reutilizan las reservaciones vigentes de la misma carga cuando cubren el bloque, conservando el horario recurrente.

Una práctica agrupa sus sesiones; cada fecha mantiene reservación, preparación, asistencia, avance, materiales e incidentes propios. El panel y el horario docente permiten abrir la sesión exacta, y el historial académico enlaza la práctica de su clase. Las sesiones fuera del horario se muestran también en la agenda e historial de prácticas sin alterar el horario recurrente. La asistencia vinculada se refleja en la clase académica; su cierre desde la práctica guarda el avance y libera la reserva puntual. Se evita iniciar o cerrar por el flujo académico una práctica que requiere su propio control de materiales.

El docente puede cerrar una sesión y continuar con las fechas restantes, agregar fechas validadas o finalizar la práctica. La última sesión queda pendiente de decisión si no se finaliza explícitamente. La finalización anticipada exige confirmar las sesiones que se cancelarán; no elimina registros ni cancela el horario oficial recurrente. Las sesiones con materiales ya entregados deben concluir su control antes de finalizar el conjunto. El inicio requiere preparación, fecha y ventana de 15 minutos antes a 15 minutos después del horario completo. La campana verifica avisos de prácticas próximas cada minuto mientras SIGA está abierto, dentro de los 30 minutos previos; el aviso evita duplicados y abre la sesión correspondiente, indicando si falta preparación.

### Validación y estado
36 suites y 143 pruebas frontend aprobadas; compilación Vite aprobada con los avisos existentes de tamaño de paquete e importación mixta de offlineStore. 27 pruebas backend dirigidas aprobadas, incluidas 15 nuevas de programación, conflictos sin guardados parciales, pertenencia, sesiones extraordinarias, continuidad, asistencia académica, agenda, avisos, reservas recurrentes y migración conservando registros. Comprobación ampliada inicial: 46 aprobadas y cuatro fallos; los cuatro se reprodujeron sin cambios en una copia aislada del commit ced4736 (expectativa de conteo histórico y pruebas con fechas/periodos fijos). No se presentan como corregidos.

Migración aditiva e6f7a8b9c0d1 desde d5e6f7a8b9c0; conserva prácticas existentes sin agruparlas retroactivamente. Confirmados volúmenes persistentes de archivos y PostgreSQL antes de publicar. Publicado el 7 de noviembre de 2026 y verificado a las 09:24 de Ciudad de México (15:24 UTC). GitHub recibió 7d7b6ac y Railway confirmó SUCCESS para backend (87deba67-d534-41c7-8a96-1565715bb064) y frontend (5442b047-c76b-4049-b152-e56ec400868e) de ese commit. El arranque confirmó upgrade d5e6f7a8b9c0 a e6f7a8b9c0d1 y migraciones aplicadas. Web y JavaScript HTTP 200, con programación por sesiones, continuación y revisión de disponibilidad presentes en el paquete publicado. API HTTP 200/healthy con base y almacenamiento correctos. Pendiente: revisión visual autenticada del docente con datos representativos. Pruebas con datos ficticios y base aislada; no se modificaron reservaciones reales. Cambios ajenos conservados y excluidos.

---

## [Preparado, sin publicar] — Horarios requieren laboratorio válido — 2026-11-07

### Problema y comportamiento resultante
El enlace del estado vacío abría la carga masiva sin laboratorio aunque los botones superiores estaban deshabilitados. Una respuesta 422 con objetos de validación se intentaba renderizar directamente y rompía la pantalla. Ahora solo se ofrecen horarios y formularios con un laboratorio presente en la lista disponible; sin laboratorios se explica la falta de asignación y se bloquean las acciones. Se respeta el laboratorio indicado en la URL si está disponible; si no lo está, se solicita seleccionar uno. El calendario del panel se deshabilita sin identificador de laboratorio. Los tres formularios de creación validan también antes del envío y los errores de horarios se convierten a texto con el normalizador existente.

### Validación y estado
34 suites y 136 pruebas frontend aprobadas, incluidas cuatro regresiones para ausencia de laboratorios, laboratorio de URL no disponible, error 422 sin caída de React y calendario sin asignación. Compilación Vite aprobada con avisos existentes de tamaño de paquete e importación mixta de offlineStore. Cambios preparados localmente; no publicados. Sin cambios de backend, permisos, migraciones ni datos. Cambios ajenos conservados. Pendiente: revisión autenticada en producción después de publicar.

---

## Preparado — Acciones de alertas según disponibilidad de datos — 2026-11-06

### Problema y comportamiento resultante
Los botones del bloque de alertas permanecían activos aunque sus indicadores no estuvieran disponibles. Ahora se deshabilitan durante la carga, ante un error o cuando su contador no es un número válido; recuperan su disponibilidad al recibir la respuesta correcta. Los accesos independientes de Acciones frecuentes siguen disponibles para una categoría confirmada, permitiendo continuar trabajando aunque falle el resumen.

Se mantienen los badges de próximos a vencer en ámbar y caducados en rojo exclusivamente para cantidades positivas, con etiquetas explícitas de acción; cero confirmado no genera badges. No cambia inventario, permisos ni categorías reales.

### Validación y estado
33 suites y 132 pruebas frontend aprobadas y compilación Vite aprobada con los avisos existentes de tamaño del paquete e importación mixta de offlineStore. Dos pruebas nuevas cubren bloqueo de botones de alertas, navegación independiente, recuperación al reintentar y badges solo para cantidades positivas; se actualiza la prueba de carga para distinguir navegación de acciones del resumen. Cambios ajenos preservados.

Preparado localmente; no publicado. Incluye la corrección local anterior de identificación del laboratorio. Pendiente: publicación y revisión visual autenticada con datos representativos.

---

## Preparado — Identificación del laboratorio y permanencia de alertas — 2026-11-06

### Problema y comportamiento resultante
La carga de categoría reemplazaba cualquier fallo por una cadena vacía. Eso permitía renderizar un panel sin alertas ni accesos específicos, sin indicar que falló la identificación. Se separan los estados cargando, listo y error, con reintento visible y conservación de la última categoría confirmada del mismo laboratorio. Se normalizan acentos, espacios y la variante Agroindustrial; no se cambia la categoría almacenada ni se infiere Química por el nombre.

Mientras no se identifica el laboratorio, el bloque de cuatro prioridades permanece visible con esqueletos; si falla, termina la carga y muestra indicadores no disponibles y la indicación para reintentar. Sus acciones específicas quedan deshabilitadas hasta confirmar una categoría compatible. Química y Agroindustria conservan alertas y accesos aunque falle la consulta de su resumen. Las respuestas tardías de otro laboratorio se ignoran. La agenda incorpora un contador tanto con registros como con cero confirmado, sin inventar cero ante errores. El resumen conserva tres métricas y ocupa todo el ancho con tres columnas de escritorio.

### Validación y estado
33 suites y 130 pruebas frontend aprobadas y compilación Vite aprobada con los avisos existentes de tamaño del paquete e importación mixta de offlineStore. Ocho pruebas nuevas cubren normalización, error/reintento, conservación de categoría, respuestas tardías, prioridades visibles durante identificación, fallo del resumen y contador de agenda con cero y registros. Sin cambios de backend, datos, migraciones ni permisos. Cambios ajenos conservados.

Preparado localmente; no publicado. La inspección del código confirma el defecto de estados de identificación, pero no demuestra por sí sola qué respuesta recibió la cuenta del usuario durante la incidencia. Pendiente: publicación y revisión visual autenticada con el laboratorio asignado.

---

## [3cafa1c] — Prioridad operativa y distribución del panel — 2026-11-06

### Problema y comportamiento resultante
Se repetían las próximas reservaciones en agenda y resumen, las acciones frecuentes dejaban espacio desigual y la criticidad dependía demasiado del color. Se elimina la métrica duplicada: el resumen conserva activos, préstamos e incidentes. Las alertas positivas explicitan Preparar materiales, Planificar reposición, Revisar vencimiento o Revisar antes de usar; se conserva ámbar para pendientes y rojo para caducados.

Las acciones frecuentes usan cuatro columnas en escritorio, dos en tableta y una en móvil, con botones uniformes. Se alinean títulos y contadores y se mejora contraste de No disponible. El aviso de error reduce márgenes y relleno y deja el folio como información secundaria; al reintentar se muestran esqueletos y al fallar termina la carga. Los accesos de navegación independientes continúan disponibles.

### Validación y publicación
31 suites y 122 pruebas frontend aprobadas y compilación Vite aprobada con los avisos existentes de tamaño del paquete e importación mixta de offlineStore. Dos pruebas nuevas cubren las etiquetas operativas, la ausencia de reservaciones duplicadas y la transición de reintento a carga sin bloquear navegación. Sin cambios de backend, permisos, migraciones ni datos. Cambios ajenos conservados y excluidos.

Publicado el 6 de noviembre de 2026 y verificado a las 23:14 de Ciudad de México (7 de noviembre, 05:14 UTC). Railway confirmó SUCCESS para backend (`08cdb3fe-cbc9-49a1-990d-d9718b877be7`) y frontend (`20913119-ac43-413c-a5f2-76c36abda770`) del commit `3cafa1c`. Web, JavaScript y CSS HTTP 200; etiquetas de criticidad y reposición presentes, y cuadrícula de acciones de cuatro columnas comprobada en CSS publicado. API HTTP 200/healthy. La revisión visual autenticada queda pendiente con el responsable. Esta mejora no atribuye ni corrige una causa nueva del fallo de carga de alertas.

---

## [e556745] — Jerarquía visual y estados del panel operativo — 2026-11-06

### Problema y comportamiento resultante
Las alertas y métricas repetían tarjetas con el mismo peso visual y enlaces verdes, dificultando distinguir prioridades. Por atender ahora es una franja unificada con separadores, cifras neutras cuando no hay pendientes, ámbar para atención y rojo para caducados. Los insumos afectados quedan en detalles desplegables. Se reduce el encabezado y los textos secundarios, y la agenda precede al resumen operativo compacto y a las acciones frecuentes.

Las acciones usan botones pequeños de borde fino o fondo suave; el verde sólido se reserva para revisar solicitudes cuando hay pendientes. Los estados de carga tienen esqueletos, con animación desactivada si el usuario prefiere movimiento reducido. Los errores terminan la carga con un aviso de sistema, reintento y folio si el servidor lo proporciona; los ceros reales permanecen como números. El diseño adapta separadores y columnas a tabletas y teléfonos y conserva foco visible en botones.

### Validación y publicación
31 suites y 120 pruebas frontend aprobadas y compilación Vite aprobada con los avisos existentes de tamaño del paquete e importación mixta de offlineStore. Dos pruebas nuevas verifican transición de carga a cero confirmado, error con folio sin carga indefinida y orden de secciones; se mantienen las comprobaciones de acciones y destinos. Sin cambios de backend, migraciones, permisos ni datos. Los registros disponibles no mostraron un fallo reciente de la consulta de alertas; su causa no se considera diagnosticada ni corregida con este cambio visual. Cambios ajenos conservados y excluidos.

Publicado el 6 de noviembre de 2026 y verificado a las 23:04 de Ciudad de México (7 de noviembre, 05:04 UTC). Railway confirmó SUCCESS para backend (`11eb5f28-a417-418a-baf2-b33a4c3057d9`) y frontend (`09fad198-ba43-4e0a-85d4-99c7864c3066`) del commit `e556745`. Web, JavaScript y CSS HTTP 200; estilos publicados de franja unificada, botones y esqueletos, y folio en el componente. API HTTP 200/healthy. La revisión autenticada de apariencia y una eventual repetición del error de alertas quedan pendientes con el responsable.

---

## [3b5f530] — Panel operativo de Química y Agroindustria — 2026-11-06

### Problema y comportamiento resultante
El panel mostraba ceros ambiguos, no distinguía errores de consulta y repetía enlaces generales sin priorizar preparación ni insumos. Ahora presenta prácticas pendientes de preparar, insumos en mínimo o sin existencias, reactivos por vencer de hoy a 30 días e insumos caducados, con conteos separados, muestra de hasta cinco registros afectados y enlaces a las listas filtradas del laboratorio. La caducidad usa la fecha de Ciudad de México y excluye inactivos.

Las métricas explican ausencia de registros o pendientes; las consultas fallidas muestran guiones, mensajes y reintento, sin convertirse en cero ni agenda vacía. Se controla la respuesta vigente al cambiar laboratorio. La agenda ofrece Ver calendario completo y los accesos frecuentes abren solicitudes pendientes, entradas de insumos, préstamos activos y mantenimiento. Agregar primer activo abre el formulario solo con permiso inventario:write; Registrar primer insumo abre su captura. Las rutas conservan el laboratorio seleccionado y los enlaces a insumos desplazan a la sección correspondiente después de cargarla. No se agrega creación de reservaciones desde el panel ni se amplían permisos.

### Validación y publicación
31 suites y 118 pruebas frontend aprobadas; 17 pruebas backend dirigidas aprobadas. Nuevas pruebas verifican ceros explicados, fallos/reintento, destinos con contexto, límites de caducidad hoy/30/31 días, stock mínimo, insumos inactivos y aislamiento de laboratorio. Compilación aprobada con los avisos existentes de tamaño del paquete e importación mixta de offlineStore. Sin migraciones ni modificación de inventarios reales; cambios previos de otros módulos preservados y excluidos.

Publicado el 6 de noviembre de 2026 y verificado a las 22:22 de Ciudad de México (7 de noviembre, 04:22 UTC). Railway confirmó SUCCESS para backend (`be9dfaf8-a615-453f-b928-adc04703ac71`) y frontend (`cf103622-6b30-4ae3-9f6d-a8f6846b8482`) del commit `3b5f530`. Web y paquete JavaScript HTTP 200 con pendientes de preparar, reactivos por vencer y reintento de alertas; API HTTP 200/healthy. Las pruebas funcionales usan datos ficticios en base aislada. Pendiente: revisión visual autenticada del responsable con el inventario real.

---

## [217cd4a] — Menú de prácticas según actividad del docente — 2026-11-06

### Problema y comportamiento resultante
El menú mostraba Seguimiento de prácticas a todos los docentes aunque nunca utilizaran Química o Agroindustria. Ahora se consulta únicamente si la cuenta tiene alguna práctica de esos laboratorios, incluyendo finalizadas y canceladas de cualquier periodo. La opción se oculta sin registros y aparece después de guardar la primera práctica, sin depender de carrera, departamento o periodo seleccionado.

La consulta devuelve solo un indicador de la cuenta autenticada. La navegación se actualiza al guardar prácticas, volver a enfocar la ventana y navegar. No hereda el indicador al cambiar de cuenta o función; mantiene el acceso ya confirmado ante fallos transitorios para la misma cuenta. El menú de responsables y los permisos del servidor conservan su funcionamiento. Ocultar la opción es una adaptación de navegación, no una prohibición de acceso directo.

### Validación y publicación
30 suites y 115 pruebas frontend aprobadas; cinco pruebas dirigidas del indicador aprobadas tras el ajuste final de conservación de estado. Ocho pruebas backend de seguimiento aprobadas, incluidas cuatro nuevas de visibilidad sin práctica propia, historial cancelado de ambas categorías sin filtro de periodo y rol responsable. Compilación frontend aprobada con avisos existentes de tamaño del paquete e importación mixta de offlineStore. Sin migraciones ni cambios de datos; cambios ajenos conservados y excluidos.

Publicado el 6 de noviembre de 2026 y verificado a las 21:17 de Ciudad de México (7 de noviembre, 03:17 UTC). Railway confirmó SUCCESS para backend (`f370665d-11b4-4ee3-af47-bb2157e7fe5a`) y frontend (`28d8d3aa-543c-422a-94c4-4399da0cbbc0`) del commit `217cd4a`. Web y paquete JavaScript HTTP 200 con consulta de visibilidad y actualización al guardar; API HTTP 200/healthy y acceso anónimo rechazado con HTTP 401. Validación funcional con datos ficticios en base aislada. Pendiente: revisión visual autenticada con las cuentas docentes reales.

---

## [9a359a4] — Seguimiento de prácticas con historial y paginación — 2026-11-06

### Problema y comportamiento resultante
El seguimiento mezclaba solicitadas y canceladas en tarjetas extensas; el listado anterior se limitaba a las últimas 200 prácticas. Se incorpora una consulta paginada en servidor y una vista inicial Activas (solicitadas, preparadas, en curso), separada de Historial (finalizadas y canceladas). No se eliminan ni reclasifican registros anteriores.

Cada fila muestra título, materia, grupo, fecha y estado con color diferenciado; Ver detalle despliega objetivos, materiales y las acciones existentes de preparación, asistencia, incidentes y reporte. Se agregan búsqueda por práctica/materia/grupo, filtros de periodo, estado y rango de fechas, limpieza de filtros, contadores y páginas de diez prácticas. Los filtros se aplican explícitamente para evitar consultas por cada tecla. El aviso de próxima práctica y las reservaciones que ya tienen seguimiento se calculan independientemente de la página seleccionada. Se conserva la consulta anterior por compatibilidad y se mantienen los permisos por docente/laboratorio.

### Validación y publicación
29 suites y 110 pruebas frontend aprobadas; 13 pruebas backend dirigidas aprobadas. Cuatro pruebas nuevas backend cubren paginación, historial de 205 registros, filtros y aislamiento de usuarios/laboratorios. Tres pruebas nuevas frontend cubren filas compactas, detalle, historial, filtros, páginas y preparación de materiales por el responsable. Compilación aprobada con los avisos existentes de tamaño del paquete e importación mixta de offlineStore. Sin migraciones ni modificación de datos históricos; cambios ajenos conservados y excluidos.

Publicado el 6 de noviembre de 2026 y verificado a las 20:57 de Ciudad de México (7 de noviembre, 02:57 UTC). Railway confirmó SUCCESS para frontend (`2ca8de0d-a5c8-4e62-af32-188c15fabb6b`) y backend (`e5202c36-518d-4299-8a3b-12237ae7847c`) del commit `9a359a4`. Web y paquete JavaScript HTTP 200 con historial, paginación y nueva consulta; API HTTP 200/healthy y seguimiento protegido con HTTP 401 para acceso anónimo. Las comprobaciones funcionales utilizan datos ficticios en base aislada. Pendiente: revisión visual autenticada del docente; no se modifican sus prácticas para probar.

---

## [419eedd] — Error al guardar prácticas y CORS — 2026-11-06

### Problema y causa verificada
Al reservar con práctica, la reserva se creaba pero el POST de práctica respondía HTTP 500; el cliente cancelaba la reserva y mostraba Network Error. El registro persistente del servidor confirmó UndefinedColumn en incidentes_practica.activo_id durante la serialización de la respuesta. El modelo incluía esa referencia al equipo, pero las migraciones publicadas no creaban la columna. Las pruebas basadas en create_all de los modelos no reproducían esa diferencia.

### Corrección
Nueva migración d5e6f7a8b9c0 desde c4d5e6f7a8b9: agrega activo_id nullable y su clave foránea a activos conservando los incidentes previos. No cambia registros históricos ni restaura la base. La creación de práctica prepara su respuesta antes del commit para evitar confirmar una operación cuya respuesta falla. CORS ahora envuelve los demás middleware, manteniendo orígenes y permisos existentes, de modo que los errores puedan llegar al navegador con mensaje y folio.

### Validación y publicación
24 pruebas backend aprobadas: creación real con materiales y notificación, fallo de respuesta sin commit, migración de tabla antigua conservando registros, CORS de error interno en la aplicación real, catálogo de materiales y controles de seguridad existentes. Validación con datos ficticios y base aislada; no se crean ni cancelan reservaciones reales para probar. Cambios previos de otros módulos conservados y excluidos de esta entrega.

Publicado el 6 de noviembre de 2026 y verificado a las 20:35 de Ciudad de México (7 de noviembre, 02:35 UTC). Railway confirmó SUCCESS para backend (`f3ce4984-08ad-4c47-b689-5c9274f019ae`) y frontend (`a907afa0-74b9-4806-a8f0-1538111684e3`) del commit `419eedd`. El arranque del backend confirmó upgrade c4d5e6f7a8b9 a d5e6f7a8b9c0 y migraciones aplicadas. Web y salud de API HTTP 200/healthy; preflight POST HTTP 200 con el origen autorizado, y rechazo anónimo HTTP 401 también con CORS. No se eliminan automáticamente los registros del intento fallido del usuario. La confirmación funcional autenticada en producción queda pendiente del reintento del docente.

---

## [3eac2a6] — Validación inmediata de fecha del horario — 2026-11-06

### Problema y comportamiento resultante
Era posible elegir una fecha de otro día de la semana y llenar la reservación y la práctica antes de conocer el error. Se comparte un campo de fecha entre la reservación docente, actividades institucionales, fecha de práctica y reservación administrativa. El calendario nativo utiliza un mínimo correspondiente a la próxima fecha del horario y pasos de siete días; la escritura manual se valida de inmediato con un aviso junto al campo. Se muestra además la fecha completa con día y mes.

Una fecha incorrecta bloquea Reservar y abrir/editar la práctica; una fecha de práctica incorrecta bloquea su continuación. Corregirla conserva los datos capturados. Se valida de nuevo al enviar y se conserva la validación del backend. Los cálculos de fecha evitan desplazamientos de día por zona horaria y usan el día actual de Ciudad de México. La validación de días lectivos y autorizaciones institucionales sigue en el servidor; esta mejora restringe el día del horario y fechas pasadas.

### Validación y publicación
28 suites y 107 pruebas frontend aprobadas. Cinco pruebas nuevas verifican miércoles frente a sábado, bloqueo inmediato, conservación de materia/grupo/práctica, cómputo y actividad institucional, mínimos semanales y cambios de mes/año. Compilación aprobada con los avisos existentes de tamaño de paquete e importación mixta de offlineStore. Sin cambios de backend, esquema ni datos; cambios ajenos del árbol conservados y excluidos.

Publicado el 6 de noviembre de 2026 y verificado a las 20:19 de Ciudad de México (7 de noviembre, 02:19 UTC). GitHub recibió `3eac2a6`; Railway confirmó SUCCESS para frontend (`cffba1ed-631f-45ae-aa0b-13a688e67d46`) y backend (`2c71b52c-10b9-42b0-b841-6b66c81058b3`) con ese commit. Web y paquete JavaScript HTTP 200, con aviso de día incorrecto y bloqueo de fecha incluidos; API HTTP 200 y healthy. Pruebas con datos ficticios, sin reservaciones reales. La presentación del calendario nativo depende del navegador; min/step y la validación inmediata del campo se complementan. Pendiente: revisión visual autenticada en el navegador del docente.

---

## [6d054fc] — Materiales de práctica desde existencias — 2026-11-06

### Problema y comportamiento resultante
La captura de materiales no permitía buscar ni distinguir un catálogo vacío de una consulta fallida; tampoco ofrecía los equipos del inventario patrimonial. Se agrega un catálogo docente del laboratorio seleccionado con insumos activos y bienes activos validados, sin datos privados patrimoniales.

El selector compartido de reservaciones y captura de prácticas permite buscar por nombre, código de inventario o CAS, filtrar materiales/reactivos/equipos, mostrar solo disponibles y actualizar existencias. Los insumos caducados, agotados, equipos no operativos o prestados se muestran sin disponibilidad al ampliar el filtro. Mantiene las selecciones al filtrar y advierte faltantes sumando renglones del mismo material. Distingue errores, carga, ausencia de registros y ausencia de coincidencias, con reintento.

La captura libre permanece como pendiente de confirmación. Los equipos se identifican por código en descripción y nota de la solicitud; se conserva el flujo de confirmación por el responsable y se muestran sus notas en el seguimiento. Consultar y solicitar no descuenta ni aparta stock. La disponibilidad es orientativa al momento de consulta, no una garantía para la fecha futura. No se agregan préstamos automáticos ni un vínculo patrimonial nuevo en la base. Al reutilizar el selector en la captura de seguimiento se corrige también el envío de su lista de materiales, que utilizaba un nombre de variable incorrecto.

### Validación y publicación
27 suites y 102 pruebas frontend aprobadas, incluidas búsquedas, filtros, faltantes acumulados, recuperación de errores y envío de referencia del equipo. Siete pruebas nuevas backend aprobadas: aislamiento por laboratorio, permisos/autenticación, exclusión de datos privados, caducidad, mantenimiento, préstamos y consulta sin descuentos. Compilación frontend aprobada con los avisos existentes de tamaño de paquete e importación mixta de offlineStore. Sin migraciones ni modificación de datos reales. Cambios previos de otros módulos conservados y excluidos de esta entrega.

Publicado el 6 de noviembre de 2026, verificado a las 20:03 de Ciudad de México (7 de noviembre, 02:03 UTC). GitHub recibió `6d054fc`; Railway confirmó SUCCESS para frontend (`077b5d27-090b-483f-89ae-82cbc9f77e71`) y backend (`5efc0034-69fb-46b6-abf9-e742d0dd7e0d`) con ese commit. Web y paquete JavaScript HTTP 200; paquete con búsqueda, filtro y actualización de existencias. API HTTP 200 y healthy; el nuevo catálogo rechaza acceso anónimo con HTTP 401. La validación funcional utiliza datos ficticios en base aislada; no se crean solicitudes reales. Pendiente: revisión visual autenticada con el inventario real del laboratorio.

---

## [30044d1] — Captura de prácticas al reservar — 2026-11-06

### Problema y comportamiento resultante
El formulario completo de práctica saturaba la reservación del docente en Química y Agroindustria. Marcar la opción ahora abre un paso dedicado dentro de la misma ventana, con nombre, fecha, objetivo, procedimiento, materiales del catálogo o libres, cantidades, unidades y seguridad. Los materiales disponen de más espacio y la ventana ajusta su altura al dispositivo.

Guardar práctica y continuar regresa al horario con un resumen y la opción Editar práctica. Conserva materia, grupo, duración y fecha de la reservación; todavía no envía solicitudes ni aparta el horario. Cancelar la captura inicial regresa sin activar la práctica; cancelar una edición recupera los datos aceptados previamente. Reservar confirma la reserva y su práctica mediante el flujo existente. Se valida nombre, fecha compatible y cantidades antes de continuar y nuevamente al reservar. Cómputo conserva sus requerimientos actuales.

### Validación y publicación
26 suites y 98 pruebas frontend aprobadas, incluidas cinco pruebas nuevas del flujo; compilación Vite aprobada con avisos de tamaño del paquete e importación mixta de offlineStore. Sin cambios de backend, esquema ni datos. Se preservaron los cambios previos de otros módulos y archivos locales, excluidos de esta entrega.

Publicado el 6 de noviembre de 2026 y verificado a las 19:38 de Ciudad de México (7 de noviembre, 01:38 UTC). GitHub recibió el commit `30044d1`; Railway confirmó SUCCESS en frontend (`5cf19527-8de2-4d1d-9dff-ff435a26bdb0`) y backend (`67faab4f-6fca-42c9-b381-53b1b5822f45`), ambos del mismo commit. Web, paquete JavaScript publicado y salud de API responden HTTP 200; el paquete contiene el nuevo paso y su botón de continuación. API healthy con base de datos y almacenamiento correctos. La prueba funcional utiliza datos simulados y no crea reservaciones reales. Pendiente: revisión visual del docente con su cuenta y sus datos.

---

## [0c3ff7c] — Flujo de clase y laboratorio — 2026-11-05

### Problema y decisión
Desde el horario se podía cerrar la asistencia y después iniciar el laboratorio desde Reservaciones. Se coordinan ambos registros conservando sus responsabilidades y la asistencia existente.

### Cambios
- Reservaciones crea o reutiliza la clase académica del día y la vincula explícitamente a la sesión de laboratorio. Bloquea iniciar otra sesión si la clase está cerrada, no impartida o en corrección, incluso si el cliente omite el identificador académico o solicita uso libre.
- El horario consulta el estado actual de una clase existente. Para uso de equipos, una reservación faltante produce un aviso en lugar de omitir silenciosamente el laboratorio. La modalidad explícita `SOLO_AULA` mantiene su recorrido académico.
- El cierre docente desde el laboratorio permite revisar equipos y registrar observaciones, y continúa a asistencia y tema. La confirmación académica cierra ambos registros. El cierre directo del laboratorio vinculado se bloquea mientras la asistencia siga abierta.
- Si la clase ya estaba finalizada, Reservaciones dirige a su registro con una explicación, sin iniciar equipos ni modificar asistencias anteriores.
- Se incorporan esta bitácora, una guía de continuidad y una instrucción de lectura para futuras sesiones de trabajo.

### Validación y publicación
Validación final: 7 pruebas nuevas de integración backend aprobadas, 25 suites y 93 pruebas frontend aprobadas, compilación frontend aprobada. La comprobación ampliada de sesiones y docencia tuvo 29 aprobadas y cuatro fallos ya presentes en los registros de la versión original (periodos, historial y fecha de una capacitación); no se presentan como corregidos. No requiere migración de esquema ni modificación de registros históricos.

Publicado el 5 de noviembre de 2026 y verificado a las 20:17 UTC. Railway confirmó SUCCESS para backend (`977ee23e-9ba9-4a71-a52e-f2ed5a0a3293`) y frontend (`05f4dc8b-9547-4a7e-aa4c-59a008301d13`), ambos del commit `0c3ff7c`. Acceso web y API con HTTP 200, salud healthy y seis archivos preservados con SHA-256 coincidente. No se alteraron asistencias reales para comprobar producción: el flujo funcional se validó con datos de prueba aislados.

Alcance: el recorrido integrado de una reservación académica pertenece al docente titular de la carga; no se añadió delegación de captura de asistencia a suplentes. Las sesiones independientes conservan su cierre de laboratorio. La inspección de equipos y las observaciones de entrega se mantienen; la operación institucional de registro sin equipos utiliza la modalidad `SOLO_AULA` configurada en el horario.

## [554e994] — Asistencia online y copia offline — 2026-11-05

Se corrigió un aviso falso de falta de conexión cuando la lista llegaba del servidor pero fallaba su copia cifrada por estar bloqueada. Un fallo opcional de caché ya no duplica cambios de asistencia confirmados. Validación: 11 pruebas dirigidas y compilación aprobadas; despliegues frontend y backend verificados, API saludable y seis archivos preservados comprobados por SHA-256. Publicado.

## [25cff5a] — Remediación de seguridad y persistencia — 2026-11-05

Sesiones persistentes y revocables, controles de acceso a laboratorios y WebSocket, límites de cargas e importaciones, cifrado offline, QR local, cabeceras CSP/HSTS y actualización de dependencias. Frontend migrado a Vite. Archivos preservados antes de configurar el volumen persistente y verificados después del despliegue.

Validación registrada: 48 pruebas finales de seguridad/autenticación aprobadas y 85 pruebas del frontend aprobadas durante la remediación; 12 fallos generales del backend confirmados también en la versión original. Auditoría npm: cero avisos críticos, altos o moderados y cinco bajos de herramientas de pruebas. Publicado y verificado; las sesiones antiguas requirieron nuevo acceso. Esta entrada resume trabajo ya realizado y no constituye una auditoría exhaustiva.

## [1.0.0] — Mayo 2026

Primera versión completa del sistema. Todos los módulos core implementados.

### Módulo 1 — Autenticación y Roles
- `POST /auth/login` — devuelve JWT (8h de expiración)
- `GET /auth/me` — perfil del usuario autenticado
- Middleware `require_roles()` para protección de endpoints
- `AuthContext.jsx` — estado global de sesión con `useAuth()` hook
- `useApi.js` — Axios con interceptor JWT automático y redirect en 401
- Seed automático del primer `SUPER_ADMIN` al iniciar la app
- Página `Login.jsx` con redirección por rol

### Módulo 2 — Gestión de Laboratorios
- CRUD completo: laboratorios + PCs individuales
- Estados de PC: `OPERATIVO / MANTENIMIENTO / DAÑADO / BAJA`
- `LaboratorioDetalle.jsx` — grid visual de asientos por laboratorio
- `AdminLayout.jsx` — sidebar con navegación lateral por módulo

### Módulo 3 — Gestión de Usuarios
- CRUD usuarios con roles (`SUPER_ADMIN / LAB_ADMIN / DOCENTE`)
- Asignación de laboratorio al LAB_ADMIN
- Importación masiva desde Excel (plantilla oficial UTECAN)
- Importación de docentes desde plantilla institucional
- Búsqueda con `AutocompleteInput` + filtros por rol y estado
- Selección múltiple + desactivación masiva con confirmación
- Reset de contraseña con generación automática

### Módulo 4 — Horarios y Reservaciones
- Slots de horario por laboratorio + cuatrimestre académico
- Grid semanal con **drag-select** de múltiples celdas
- Estados: `LIBRE / RESERVADO / BLOQUEADO / EN_DISPUTA`
- Resolución de conflictos entre docentes
- Períodos académicos: ENE-ABR / MAY-AGO / SEP-DIC
- `TimeGrid.jsx` — componente grid reutilizable (Horarios + Reservaciones)
- Celdas EN_DISPUTA: `animate-pulse` + rayas diagonales para accesibilidad daltónica

### Módulo 5 — Sesiones de Clase
- Inicio de sesión desde reservación confirmada
- Asignación de alumnos a PCs por matrícula o nombre (búsqueda en tiempo real)
- Reporte de incidencias por PC durante la sesión activa
- Mapa de PCs en tiempo real con **WebSocket** (`/ws/mapa/{sesion_id}`)
- `ConnectionManager` en `ws/mapa.py` — broadcast a todos los clientes de la sesión
- Finalización de sesión con observaciones y cierre de asignaciones

### Módulo 6 — Inventario de Activos
- Activos tecnológicos con código auto-generado (`INV-YYYY-NNNN`)
- 8 categorías: COMPUTADORA / IMPRESORA_3D / BRAZO_ROBOTICO / SCANNER / IOT / HERRAMIENTA / MOBILIARIO / OTRO
- Importación masiva Excel con validaciones de formato
- Vista grid y tabla intercambiable
- Filtros: laboratorio, categoría, estado

### Módulo 7 — Préstamos de Equipos
- Registro con tipo receptor: alumno / docente / personal / externo
- Búsqueda de activos con autocompletado por nombre y código
- Devoluciones con fecha límite y alertas de vencimiento
- Estados: `ACTIVO / VENCIDO / DEVUELTO`

### Módulo 8 — Mantenimiento
- **Tab Kanban**: tarjetas de incidentes en 3 columnas (Reportados → En Revisión → Reparados)
- **Tab Preventivo**: programación con periodicidad Semanal / Mensual / Trimestral / Semestral / Anual
- **Tab Historial**: timeline de intervenciones por equipo
- Auto-detección de laboratorio para LAB_ADMIN
- Modelos nuevos: `MantenimientoPreventivo`, `HistorialMantenimiento`

### Módulo 9 — Catálogo Académico
- `CatalogoAlumno`: matrícula, carrera, cuatrimestre, grupo, periodo
- `CatalogoMateria`: código, nombre, carrera, cuatrimestre oficial
- Importación masiva Excel para ambas entidades
- Base de datos de alumnos para búsqueda en sesiones de clase

### Módulo 10 — Reportes Mensuales
- Resumen ejecutivo por laboratorio + mes + año
- KPIs: sesiones totales, horas de uso, reservaciones, incidencias, alumnos atendidos
- Top 5 docentes por horas de uso
- Top 5 PCs con más incidencias reportadas

### Módulo 11 — Notificaciones
- Modelo `Notificacion` con campos: titulo, mensaje, tipo, leida, fecha
- `NotificacionesBell.jsx` — campana en navbar con badge contador (polling 30s)
- Integración automática en: creación de reservaciones, préstamos vencidos, mantenimiento
- Servicio SMTP opcional (`services/email.py`) configurable vía `.env`

### UI — Dark Glassmorphism Theme (refactor completo)
- CSS variables globales definidas en `frontend/public/index.html`:
  `--bg`, `--surface`, `--surface-2`, `--border`, `--blue`, `--emerald`, `--glass-bg`
- Clases utilitarias globales: `.glass`, `.glass-sm`, `.glass-dark`, `.input-dark`,
  `.btn-blue`, `.btn-emerald`, `.btn-ghost`, `.nav-active`, `.nav-item`
- **`SelectDark.jsx`** — dropdown 100% custom en React:
  - Fondo: `rgba(15,23,42,0.97)` + `backdrop-filter: blur(12px)`
  - Sin borde negro del OS — usa `rgba(255,255,255,0.10)`
  - Hover: `rgba(59,130,246,0.18)` + borde izquierdo 2px `#3b82f6`
  - Texto: `text-slate-300` → `text-white` en hover
  - Navegación por teclado: ArrowUp/Down/Enter/Escape
  - Checkmark SVG en opción seleccionada activa
  - Click-outside detectado con `useRef` + `mousedown` listener
  - Reemplaza **todos** los `<select>` nativos en la aplicación
- **`ModalConfirmar`** — componente de confirmación dark (elimina `window.confirm()`):
  - `fixed inset-0 bg-black/70 backdrop-blur-sm` + `.glass rounded-2xl`
  - Botón Aceptar con degradado rojo: `linear-gradient(135deg,#ef4444,#dc2626)`
- `ToastContext.jsx` — sistema de toasts global (éxito / error / info)
- Animaciones: `fadeUp`, `slideInRight`, `slideInUp`, `spin`, `pulse`, `disputaPulse`
- Scrollbar personalizada (5px, `#334155`)
- Safe-area insets para móvil con notch

### PWA
- `manifest.json` — nombre, íconos, colores
- `sw.js` — Service Worker cache-first
- Íconos: 16, 32, 192, 512px + apple-touch-icon 180px
- Safe-area insets: `env(safe-area-inset-bottom/left/right)`

### Scripts de Windows
- `INICIAR_LABCONTROL.bat` — levanta backend + frontend en terminales separadas
- `DETENER_LABCONTROL.bat` — mata los procesos
- `AGREGAR_AL_INICIO_WINDOWS.bat` / `QUITAR_DEL_INICIO_WINDOWS.bat` — autostart

### Infraestructura
- `docker-compose.yml` — backend `:8000` + frontend `:3000`
- `.env.example` — plantilla completa de configuración
- `.gitignore` — Python, venv, .env, *.db, node_modules, build, logs, IDE, OS

---

## Próximas versiones (backlog)

### [1.1.0] — Pendiente
- [ ] Portal del Alumno (ver asignación de PC activa)
- [ ] Notificaciones push via n8n + Telegram Bot
- [ ] Exportar reportes a PDF

### [1.2.0] — Pendiente
- [ ] Solicitud de laboratorio alternativo (inter-laboratorio)
- [ ] Dashboard docente con historial personal
- [ ] Calendario global de todos los labs

### [2.0.0] — Futuro
- [ ] PostgreSQL en producción
- [ ] CI/CD con GitHub Actions
- [ ] Login de alumnos para ver asignación activa
- [ ] Modo oscuro/claro toggle
