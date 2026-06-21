# Manual de usuario: Inventario patrimonial SIGA

Este manual explica el flujo correcto del modulo de inventario para una demo funcional de SIGA UTECAN. El objetivo es mostrar que el inventario no es solo un listado de equipos, sino un control patrimonial con validacion, trazabilidad, prestamos, mantenimiento, bajas y levantamientos fisicos.

## Idea central para el demo

El flujo recomendado es:

1. Registrar o importar activos.
2. Revisar y validar los activos institucionalmente.
3. Operar los activos validados: etiquetas, resguardos, prestamos, movimientos y mantenimiento.
4. Documentar incidencias, bajas y levantamientos fisicos.
5. Consultar el expediente completo del bien.

La frase clave para presentar el modulo es:

> "Nada se borra sin rastro: cada activo conserva su expediente, sus movimientos, sus prestamos, sus incidentes y sus bajas."

## Roles del flujo

| Rol | Uso principal |
| --- | --- |
| Super Admin | Valida inventario, autoriza bajas, configura catalogos y consulta todo el flujo. |
| Lab Admin | Registra activos, opera prestamos, mantenimiento y control de laboratorio. |
| Responsable de laboratorio | Captura y corrige activos de su laboratorio. |
| Administrativo | Consulta inventario segun permisos del area. |
| Inventario institucional | Revisa, observa, valida o rechaza altas patrimoniales. |

## Flujo correcto del inventario

### 1. Preparar catalogos

Antes de capturar muchos activos, se recomienda revisar:

- Categorias de activos.
- Tipos de ubicacion.
- Laboratorios.
- Departamentos.
- Usuarios/resguardantes.

En el sistema, esto se muestra desde `Inventario > Catalogos inventario` cuando el usuario tiene permiso institucional.

### 2. Registrar activos

Hay dos formas:

- `Nuevo activo`: captura manual de un bien.
- `Importar Excel`: carga masiva desde plantilla.

Datos importantes por activo:

- Codigo de inventario.
- Numero oficial patrimonial, si existe.
- Nombre del bien.
- Categoria.
- Marca, modelo y numero de serie.
- Laboratorio o departamento.
- Ubicacion.
- Responsable o resguardante.
- Estado fisico.
- Observaciones.

Recomendacion para demo:

1. Crear un activo manualmente.
2. Mostrar que queda en estado administrativo `BORRADOR` o `EN REVISION`.
3. Explicar que todavia no forma parte del inventario operativo hasta validarse.

### 3. Revision institucional

El inventario institucional revisa los activos antes de hacerlos oficiales.

Estados administrativos:

| Estado | Significado |
| --- | --- |
| BORRADOR | Capturado, pero aun no enviado formalmente a revision. |
| EN_REVISION | Listo para ser revisado por inventario institucional. |
| OBSERVADO | Requiere correccion. |
| VALIDADO | Activo autorizado para operar. |
| RECHAZADO | El alta no procede. |
| BAJA_SOLICITADA | Tiene tramite de baja abierto. |
| BAJA_EJECUTADA | La baja ya fue concluida. |

Regla importante:

Solo los activos `VALIDADO` habilitan operacion completa: QR, resguardo, movimientos, prestamos, mantenimiento, bajas y levantamientos.

### 4. Operacion del activo validado

Cuando un activo ya esta validado se puede:

- Generar etiqueta QR.
- Descargar formato de resguardo.
- Registrar movimiento de ubicacion/resguardante.
- Prestar el activo.
- Programar mantenimiento preventivo.
- Reportar incidente o dano.
- Solicitar baja patrimonial.
- Ver expediente digital.

### 5. Prestamos

El prestamo aplica para activos operativos y disponibles.

Flujo:

1. Seleccionar activo.
2. Capturar solicitante.
3. Definir fecha de retorno esperada.
4. Registrar condicion de salida.
5. Al devolver, registrar condicion de retorno.

El sistema evita prestar un activo que ya esta prestado o dado de baja.

### 6. Mantenimiento e incidentes

Hay dos tipos de control:

- Incidente: dano, perdida, observacion o problema reportado.
- Mantenimiento preventivo: limpieza, revision, actualizacion, respaldo, formateo u otra tarea programada.

Estados comunes de incidentes:

- Pendiente.
- En revision.
- Reparado.
- Dado de baja.

Estados comunes de mantenimiento preventivo:

- Pendiente.
- En proceso.
- Completado.
- Omitido.

Para demo conviene mostrar:

1. Abrir un activo.
2. Programar mantenimiento.
3. Ver alerta si esta proximo o vencido.
4. Mostrar que el historial queda en el expediente.

### 7. Baja patrimonial

La baja no debe hacerse borrando el activo. Debe quedar como tramite.

Flujo formal:

1. Solicitud de baja.
2. Revision administrativa.
3. Validacion fisica.
4. Autorizacion.
5. Ejecucion.

Al ejecutar la baja:

- El activo queda inactivo.
- El estado fisico cambia a `BAJA`.
- El estado administrativo cambia a `BAJA_EJECUTADA`.
- El expediente conserva la evidencia.

### 8. Levantamiento fisico

El levantamiento sirve para revisar fisicamente los bienes de un laboratorio o departamento.

Estados por activo revisado:

- Localizado.
- No localizado.
- Otra ubicacion.
- Danado.
- Propuesto para baja.
- Datos incompletos.

Uso recomendado:

1. Crear campana de levantamiento.
2. Revisar los activos del alcance.
3. Registrar hallazgos.
4. Cerrar levantamiento.
5. Consultar resultados desde el expediente.

### 9. Expediente digital del bien

El expediente concentra:

- Datos generales.
- Movimientos.
- Prestamos.
- Incidentes.
- Mantenimientos.
- Bajas.
- Levantamientos fisicos.

Este es el cierre ideal del demo, porque demuestra trazabilidad.

## Guion sugerido para presentacion

Duracion sugerida: 6 a 8 minutos.

1. Entrar como responsable o Lab Admin.
2. Abrir `Inventario`.
3. Crear o importar un activo.
4. Mostrar que queda pendiente de validacion.
5. Cambiar a Super Admin o Inventario institucional.
6. Validar el activo.
7. Generar etiqueta QR o resguardo.
8. Simular prestamo o mantenimiento.
9. Abrir expediente digital.
10. Explicar que cualquier baja requiere tramite, no eliminacion directa.

Mensaje final:

> "SIGA permite operar el laboratorio, pero al mismo tiempo deja evidencia patrimonial para auditoria."

## Buenas practicas

- No usar inventario patrimonial para consumibles como hojas, tintas o papeleria.
- Registrar bienes individualizados.
- Usar numero oficial si la institucion ya tiene uno.
- No modificar ubicaciones de forma informal: usar movimientos.
- No borrar activos: solicitar baja.
- Hacer levantamientos fisicos por periodo o cierre de cuatrimestre.
- Mantener responsables y ubicaciones actualizados.

## Diferencia con equipos PC del laboratorio

En SIGA existen dos conceptos relacionados:

- PC de laboratorio: puesto operativo dentro del mapa del laboratorio, usado para sesiones, asistencia y autoasignacion.
- Activo patrimonial: bien registrado en inventario, con codigo, resguardo, movimientos, bajas y expediente.

Una PC puede existir como puesto operativo aunque no este vinculada a un activo patrimonial. Lo ideal es vincularla cuando el equipo ya esta inventariado oficialmente.

## Checklist rapido antes del demo

- Hay al menos un activo en BORRADOR o EN_REVISION.
- Hay al menos un activo VALIDADO.
- Hay al menos una etiqueta QR o resguardo disponible.
- Hay un activo con mantenimiento o incidente.
- Hay un expediente digital con historial.
- La cuenta Super Admin puede entrar a la pestana Revision.
- La cuenta Lab Admin puede capturar y operar activos.
