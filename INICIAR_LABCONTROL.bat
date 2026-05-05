@echo off
title LabControl UTECAN — Iniciando...
color 0A

echo.
echo  ================================================
echo   LabControl UTECAN — Universidad Tecnologica
echo  ================================================
echo.

:: Verificar que Docker Desktop esté corriendo
echo  [1/3] Verificando Docker Desktop...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  Docker no esta corriendo. Iniciando Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo  Esperando 20 segundos para que Docker arranque...
    timeout /t 20 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: Docker no pudo iniciarse.
        echo  Abre Docker Desktop manualmente y vuelve a ejecutar este script.
        pause
        exit /b 1
    )
)
echo  Docker listo.

:: Ir a la carpeta del proyecto
cd /d "%~dp0"

:: Levantar los contenedores
echo.
echo  [2/3] Iniciando backend y frontend...
docker-compose up -d

if %errorlevel% neq 0 (
    echo.
    echo  ERROR al iniciar los contenedores.
    echo  Revisa que el archivo docker-compose.yml este en esta carpeta.
    pause
    exit /b 1
)

:: Esperar a que el backend esté listo
echo.
echo  [3/3] Esperando a que los servicios estén listos...
timeout /t 5 /nobreak >nul

:: Abrir el sistema en el navegador
echo.
echo  ================================================
echo   Sistema listo!
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:8000
echo   API Docs:  http://localhost:8000/docs
echo  ================================================
echo.

:: Abrir el navegador automáticamente
start "" "http://localhost:3000"

echo  Presiona cualquier tecla para cerrar esta ventana.
echo  (Los servicios seguiran corriendo en segundo plano)
pause >nul
