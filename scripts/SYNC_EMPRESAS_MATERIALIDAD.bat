@echo off
title Sincronizador de Emisoras a Materialidad
chcp 65001 > nul
cls

echo ========================================================
echo   PROGRAMA DE SINCRONIZACION DE EMISORAS A MATERIALIDAD
echo ========================================================
echo.
echo Este programa leera el archivo Excel principal del Dashboard
echo y agregara todas las Emisoras a la base de datos de Materialidad
echo para que aparezcan en los menus desplegables para siempre.
echo.
echo Presiona cualquier tecla para comenzar...
pause > nul
echo.

python sincronizar_emisoras.py

echo.
pause
