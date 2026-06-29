@echo off
color 0A
title Forzar SuperUser y Corregir Usuarios
echo ==================================================
echo   CORRIGIENDO ESTADOS EN BASE DE DATOS...
echo ==================================================
echo.
pushd "%~dp0..\app\backend"
python fix_users.py
echo.
echo Operacion finalizada. Ya puedes recargar el navegador.
echo.
pause
popd
