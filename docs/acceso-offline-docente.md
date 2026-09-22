# Acceso offline docente con PIN

## Alcance de esta entrega

El docente con sesión institucional activa descarga su jornada y las listas del periodo actual. Después de comprobar que el paquete se guardó en el dispositivo, configura un PIN de seis dígitos. El PIN permite reabrir la copia local tras cerrar la pestaña o el navegador, durante un máximo de 24 horas. La credencial local se cifra con AES-GCM y una clave derivada del PIN mediante PBKDF2; el PIN no se guarda. Cinco intentos fallidos bloquean el acceso durante 15 minutos.

El PIN no es una sesión del servidor. Durante el acceso local solo se permiten Inicio docente y las clases descargadas. Las capturas quedan en cola en el dispositivo. Al recuperar la conexión, el docente debe volver a iniciar sesión institucional; entonces SIGA intenta sincronizar las operaciones. Cerrar sesión no borra la cola, y se advierte al docente cuando hay capturas pendientes.

## Preparación antes de salir de línea

1. Con internet, iniciar sesión en el dispositivo personal que se usará en clase.
2. En Inicio docente, pulsar **Actualizar datos offline** y confirmar que aparecen la jornada y las listas.
3. Configurar y confirmar el PIN. Anotar mentalmente su vigencia, visible en pantalla.
4. Abrir una clase previamente descargada y probar la operación sin conexión antes de depender de ella en una jornada completa.

Si se cierra el navegador, se abre la página habitual de SIGA y se elige **Continuar sin conexión**. Una vez disponible internet, se inicia sesión con correo y contraseña para sincronizar. El indicador permanece visible también en móvil y abre el detalle de capturas pendientes o rechazadas. Desde el quinto día advierte que el plazo de aceptación automática está próximo a vencer.

## Límites de seguridad y operación

- La credencial del PIN está cifrada, pero **las listas y capturas en IndexedDB todavía no lo están**. No se debe presentar esta función como almacenamiento local cifrado ni habilitarla en equipos compartidos sin una decisión institucional de seguridad y retención.
- El bloqueo por intentos es local y no sustituye el control de acceso del sistema operativo. Un PIN de seis dígitos no protege frente a alguien con acceso completo al perfil del navegador y sus archivos.
- Borrar datos del sitio, usar navegación privada o cambiar de dispositivo puede eliminar las capturas no sincronizadas.
- El paquete refleja el estado de la última descarga. Cambios de inscripción, horario o calendario posteriores requieren reconciliación al sincronizar; el servidor conserva la autoridad.
- Reservar laboratorios o espacios y modificar el horario siguen siendo operaciones exclusivamente en línea.
- Este acceso cubre jornada, pase de lista y bitácora de clase. También permite consultar, con la hora de corte visible, el horario, hasta 80 clases recientes y el seguimiento de los grupos descargados. Reportes individuales y tutoría offline aún no están incluidos.
- El plazo de siete días limita la aceptación automática del servidor; una captura vencida o rechazada se conserva localmente como **Requiere revisión** hasta que el docente la respalde, reintente o descarte con confirmación.

## Verificación previa a producción

- Probar en HTTPS, con una sesión docente real y datos de prueba, la configuración del PIN y la reapertura tras cerrar completamente el navegador.
- Probar PIN correcto, incorrecto, cinco intentos fallidos, bloqueo, vencimiento y renovación con sesión institucional.
- Probar una clase nueva y una clase ya abierta: pase de lista, nota de grupo, cierre y sincronización posterior sin duplicados.
- Probar cierre de sesión con pendientes, conexión intermitente, rechazo del servidor y conflicto visible.
- Probar cambio de inscripción o calendario entre la descarga y la sincronización.
- Confirmar que otra cuenta del mismo dispositivo no puede abrir la copia local del docente anterior.
- Revisar política de cifrado y borrado de datos locales antes de habilitar el uso institucional en producción.
