# Seguridad de sesiones

## Objetivo

Evitar que una sesion institucional quede abierta indefinidamente en equipos compartidos, laboratorios, oficinas o navegadores abandonados.

## Politica aplicada

- La sesion se guarda en `sessionStorage`, no en `localStorage`.
- Si el usuario cierra la pestana o el navegador, el token local desaparece.
- Si el usuario permanece inactivo, el frontend muestra una advertencia antes de cerrar.
- Por defecto, la advertencia aparece a los 40 minutos sin actividad.
- Por defecto, la sesion se cierra automaticamente a los 45 minutos sin actividad.
- Al cerrar por inactividad se limpia `token`, usuario local, identificador de pestana y ultimo tiempo de actividad.
- Si existe una sesion registrada en backend, el frontend intenta notificar `/auth/sessions/logout`.
- Al recargar la pagina despues del tiempo limite, el sistema limpia la sesion y redirige al login.

## Actividad considerada valida

El contador se reinicia con acciones reales del usuario:

- Clic o toque.
- Teclado.
- Scroll.
- Movimiento de mouse, limitado internamente para no escribir demasiado en `sessionStorage`.
- Volver a enfocar la pestana, siempre que la sesion no haya superado ya el tiempo maximo.

## Variables de configuracion

Frontend:

```env
REACT_APP_IDLE_WARNING_MINUTES=40
REACT_APP_IDLE_TIMEOUT_MINUTES=45
```

Backend:

```env
ACCESS_TOKEN_EXPIRE_MINUTES=480
```

`ACCESS_TOKEN_EXPIRE_MINUTES` es la vida maxima del token JWT. El cierre por inactividad del frontend debe ser menor que ese valor.

## Recomendacion para produccion

Para un entorno institucional, se recomienda:

- Mantener `REACT_APP_IDLE_TIMEOUT_MINUTES` entre 30 y 60 minutos.
- Usar 45 minutos como valor inicial para no interrumpir trabajo normal, pero proteger equipos abandonados.
- Mantener `ACCESS_TOKEN_EXPIRE_MINUTES` entre 4 y 8 horas si se requiere una jornada completa.
- Evitar sesiones persistentes en equipos de laboratorio.
- Documentar esta politica en el manual de usuario y en la capacitacion.

## Comportamiento esperado

1. El usuario inicia sesion.
2. El sistema registra la ultima actividad.
3. Si no hay uso durante 40 minutos, aparece un aviso de sesion por expirar.
4. Si el usuario presiona `Continuar`, la sesion sigue activa.
5. Si no hace nada y pasan 45 minutos, el sistema cierra la sesion y vuelve al login.
6. Si el usuario actualiza la pagina despues del limite, tambien se cierra la sesion.

## Nota operativa

Este control no sustituye la expiracion del token ni las validaciones del backend. Es una proteccion adicional de experiencia y seguridad para reducir el riesgo de sesiones abandonadas.
