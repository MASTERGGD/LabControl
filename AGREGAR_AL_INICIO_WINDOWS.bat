@echo off
title Configurar inicio automatico de LabControl
echo.
echo  Agregando LabControl al inicio automatico de Windows...
echo.

:: Carpeta de inicio de Windows del usuario actual
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

:: Crear acceso directo en la carpeta de inicio
:: (usando PowerShell para crear el .lnk)
powershell -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $s = $ws.CreateShortcut('%STARTUP%\LabControl UTECAN.lnk'); ^
   $s.TargetPath = '%~dp0INICIAR_LABCONTROL.bat'; ^
   $s.WorkingDirectory = '%~dp0'; ^
   $s.WindowStyle = 1; ^
   $s.Description = 'Iniciar LabControl UTECAN'; ^
   $s.Save()"

if %errorlevel% equ 0 (
    echo  LISTO. LabControl arrancara automaticamente cuando inicies Windows.
    echo.
    echo  Acceso directo creado en:
    echo  %STARTUP%\LabControl UTECAN.lnk
    echo.
    echo  Para quitarlo del inicio, ejecuta QUITAR_DEL_INICIO_WINDOWS.bat
) else (
    echo  Error al crear el acceso directo. Intenta ejecutar como Administrador.
)

echo.
pause
