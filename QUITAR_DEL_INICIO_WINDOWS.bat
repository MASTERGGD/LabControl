@echo off
title Quitar LabControl del inicio automatico
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

if exist "%STARTUP%\LabControl UTECAN.lnk" (
    del "%STARTUP%\LabControl UTECAN.lnk"
    echo  LabControl eliminado del inicio automatico de Windows.
) else (
    echo  LabControl no estaba en el inicio automatico.
)
echo.
pause
