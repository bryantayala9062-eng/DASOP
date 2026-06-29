@echo off
setlocal EnableExtensions

set "TASK_NAME=PORTAL_ERP_AUTO_START"
set "SCRIPT_PATH=%~dp0AUTO_INICIO_ERP.bat"

echo Creando tarea programada: %TASK_NAME%
echo Script: %SCRIPT_PATH%

:: Eliminar si ya existe
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

:: Crear tarea al iniciar Windows
schtasks /Create /TN "%TASK_NAME%" /SC ONSTART /RL HIGHEST /RU "SYSTEM" /F /TR "cmd /c \"%SCRIPT_PATH%\""

if %ERRORLEVEL% NEQ 0 (
  echo ERROR: No se pudo crear la tarea. Ejecuta este .bat como Administrador.
  pause
  exit /b 1
)

echo Tarea creada correctamente (se ejecuta al iniciar Windows).
echo Nota: se ejecuta como SYSTEM; los logs quedan en scripts\logs\auto_start.log
pause
endlocal
exit /b 0
