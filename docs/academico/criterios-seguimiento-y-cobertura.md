# Criterios institucionales de seguimiento y cobertura

## Propósito

División de Carrera, Mis Tutorados y el expediente individual deben presentar el mismo veredicto para un alumno, periodo y fecha de corte. La ausencia de registros no equivale a asistencia perfecta ni a cero por ciento.

## Definiciones

- **Asistencia observada:** porcentaje calculado únicamente con pases de lista existentes: presente, retardo o justificada entre el total de estados capturados.
- **Sesiones esperadas:** ocurrencias lectivas calculadas con el horario recurrente y el calendario académico publicado, excluyendo suspensiones y recesos.
- **Cobertura:** sesiones registradas entre sesiones esperadas a la fecha de corte.
- **Muestra por materia:** registros individuales disponibles para interpretar el comportamiento del alumno en una asignatura.

## Estados institucionales

- **Sin registros de asistencia:** no existe ningún pase de lista para el alumno.
- **Sin base suficiente:** la cobertura institucional está debajo del umbral vigente o hay menos de tres observaciones. Durante el inicio se presenta como “Semana N · aún no hay base suficiente”.
- **Riesgo:** asistencia observada menor a 80% o tres faltas consecutivas.
- **Atención:** asistencia observada de 80% a menos de 90%, dos faltas consecutivas, acuerdos pendientes o reportes abiertos.
- **Regular:** existe base suficiente y no hay indicadores preventivos.

Los reportes y acuerdos conservan su valor preventivo aun cuando la cobertura sea insuficiente.

## Umbral de cobertura

El valor institucional predeterminado es **50%** y se configura con `SIGA_UMBRAL_COBERTURA_MINIMA`. Coordinación Académica es responsable de autorizar, documentar y comunicar cualquier modificación. El cambio debe incluir valor anterior, valor nuevo, responsable, fecha y justificación en el control de configuración del despliegue.

## Presentación y fecha de corte

Las listas muestran **ASISTENCIA OBSERVADA** como encabezado. Cada celda presenta el porcentaje y debajo “X de Y sesiones”. Por debajo del umbral se oculta el porcentaje destacado y se muestra “Sin base suficiente”. Las respuestas declaran `calculado_en`, semana académica y fecha de corte cuando existe calendario oficial.

## Origen y permisos

- El tutor consulta únicamente sus grupos asignados, con asistencia consolidada de todas sus materias.
- División de Carrera consulta todos sus grupos y la cobertura institucional.
- “Detectado por asistencia” describe una regla automática.
- “Reporte docente” describe una observación enviada; no implica incumplimiento de otros docentes.
- Cuando tutor y docente son la misma persona, las evidencias se consolidarán en un caso, sin duplicarse.

## Notificaciones de captura

Una solicitud por sesiones pendientes debe dirigirse a División, agruparse por grupo, materia y sesiones, y permanecer bloqueada mientras esté abierta. Su estado debe regresar al tutor como “Notificado el FECHA · en revisión”. No se crearán solicitudes por alumno para una misma omisión de captura.

## Casos mínimos de aceptación

1. El mismo alumno, periodo y fecha de corte obtiene el mismo estado y motivos en las tres vistas.
2. Sin registros produce “Sin registros de asistencia”, nunca `0%`.
3. Cobertura menor a 50% produce “Sin base suficiente” y oculta el porcentaje destacado.
4. Cobertura igual a 50% permite aplicar la evaluación si también existe muestra mínima.
5. Buena cobertura general y muestra insuficiente en una materia conserva esa materia como preliminar.
6. Tutor que también imparte la materia recibe una sola señal consolidada.
7. Varias personas afectadas por las mismas sesiones originan una sola notificación agrupada.
8. Todas las vistas exponen la misma fecha de cálculo; cualquier caché se invalida al cerrar o corregir una lista.

## Historial

- 2026-09-09: criterio inicial acordado. Umbral predeterminado de cobertura: 50%. Responsable funcional: Coordinación Académica.
