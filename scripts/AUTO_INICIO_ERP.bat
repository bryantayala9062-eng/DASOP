@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0.."
set "LOG_DIR=%ROOT%\scripts\logs"
set "LOG_FILE=%LOG_DIR%\auto_start.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

echo ================================================== >> "%LOG_FILE%"
echo [%DATE% %TIME%] AutoStart iniciado >> "%LOG_FILE%"

:: Verificar si backend (8010) ya esta corriendo
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8010" ^| find "LISTENING"') do set "PID_8010=%%a"
if defined PID_8010 (
  echo [%DATE% %TIME%] Backend ya activo (PID %PID_8010%). No se reinicia. >> "%LOG_FILE%"
) else (
  echo [%DATE% %TIME%] Iniciando ERP... >> "%LOG_FILE%"
  set "AUTO_START=1"
  call "%ROOT%\INICIAR_ERP.bat" >> "%LOG_FILE%" 2>&1
  if errorlevel 1 (
    echo [%DATE% %TIME%] ERROR al iniciar ERP (codigo %ERRORLEVEL%). >> "%LOG_FILE%"
    goto :END
  )
)

:: Esperar a que el frontend este disponible (puerto 5190)
set /a RETRIES=0
:WAIT_FRONT
for /f "tokens=5" %%b in ('netstat -aon ^| find ":5190" ^| find "LISTENING"') do set "PID_5190=%%b"
if defined PID_5190 (
  echo [%DATE% %TIME%] Frontend activo (PID %PID_5190%). >> "%LOG_FILE%"
) else (
  set /a RETRIES+=1
  if !RETRIES! GEQ 30 (
    echo [%DATE% %TIME%] Frontend no levanto en el tiempo esperado. >> "%LOG_FILE%"
    goto :END
  )
  timeout /t 2 /nobreak >nul
  goto :WAIT_FRONT
)

:: Iniciar Tunel si no esta corriendo
for /f "tokens=5" %%c in ('netstat -aon ^| find ":5190" ^| find "LISTENING"') do set "PID_5190=%%c"
if not defined PID_5190 (
  echo [%DATE% %TIME%] No hay frontend activo. Tunel no se inicia. >> "%LOG_FILE%"
  goto :END
)

:: Intentar detectar proceso cloudflared (si ya esta, no levantar)
tasklist /FI "IMAGENAME eq cloudflared-windows-amd64.exe" | find /I "cloudflared-windows-amd64.exe" >nul 2>&1
if %ERRORLEVEL%==0 (
  echo [%DATE% %TIME%] Cloudflared ya estaba activo. >> "%LOG_FILE%"
  goto :END
)

echo [%DATE% %TIME%] Iniciando tunel Cloudflare... >> "%LOG_FILE%"
start "ERP_Cloudflare" cmd /k "%ROOT%\INICIAR_TUNEL.bat"

:END
echo [%DATE% %TIME%] AutoStart finalizado >> "%LOG_FILE%"
endlocal
exit /b 0
