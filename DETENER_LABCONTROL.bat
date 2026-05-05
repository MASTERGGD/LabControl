@echo off
title LabControl UTECAN — Deteniendo...
color 0C

echo.
echo  ================================================
echo   LabControl UTECAN — Deteniendo servicios
echo  ================================================
echo.

cd /d "%~dp0"

echo  Deteniendo contenedores...
docker-compose down

echo.
echo  Servicios detenidos correctamente.
echo.
pause
