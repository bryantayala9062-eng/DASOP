@echo off
title PORTAL ERP CORPORATIVO - Launcher
color 0B

echo ==================================================
echo   SISTEMA ERP CORPORATIVO INTEGRADO
echo ==================================================
echo.

:: Cambiar al directorio raíz del ERP (soporta rutas UNC)
pushd "%~dp0"

echo [1/4] Limpiando procesos previos...
:: Matar forzosamente cualquier proceso de python corriendo en los puertos 8010 y 8000
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8010" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8000" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
:: Matar instancias previas de cloudflared
taskkill /F /IM cloudflared-windows-amd64.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq ERP_Backend" /T >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Compliance_Backend" /T >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq ERP_Frontend" /T >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq ERP_Cloudflare" /T >nul 2>&1

echo [2/4] Iniciando Backends (ERP y Compliance)...
set PYTHONDONTWRITEBYTECODE=1
start "ERP_Backend" cmd /k "set PYTHONDONTWRITEBYTECODE=1 && pushd app\backend && python -B -m uvicorn main:app --host 0.0.0.0 --port 8010"
start "Compliance_Backend" cmd /k "set PYTHONDONTWRITEBYTECODE=1 && pushd compliance\backend && python -B -m uvicorn main:app --host 0.0.0.0 --port 8000"

:: Esperar a que levante la API
timeout /t 3 /nobreak >nul

echo [3/4] Iniciando Frontend...
start "ERP_Frontend" cmd /k "pushd app\frontend && npm run dev"

:: Esperar a que levante el frontend
timeout /t 4 /nobreak >nul

if not /i "%AUTO_START%"=="1" (
    echo Abriendo Portal ERP en el navegador...
    start "" "http://localhost:5190"
)

echo.
echo ==================================================
echo   ¡TODO LISTO!
echo ==================================================
echo   Backend  (Red Local):  http://192.168.100.227:8010
echo   Portal   (Red Local):  http://192.168.100.227:5190
echo ==================================================
echo.
echo No olvides ejecutar "INICIAR_TUNEL.bat" desde tu escritorio
echo para conectar el ERP al dominio de internet.
echo ==================================================
echo.
if /i "%AUTO_START%"=="1" (
popd
exit /b 0
)
pause
popd
