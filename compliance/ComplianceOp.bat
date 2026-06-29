@echo off
TITLE Iniciando ComplianceOP

echo ===================================================
echo   Matando procesos de uvicorn y python antiguos...
echo ===================================================
taskkill /F /IM uvicorn.exe /T 2>nul
taskkill /F /IM python.exe /T 2>nul
echo Procesos limpiados.
echo.

echo ===================================================
echo   Iniciando Backend (FastAPI - Uvicorn)...
echo ===================================================
cd backend

:: Usamos START para lanzarlo en una nueva ventana para que no bloquee este script, 
:: o simplemente lo dejamos corriendo aquí si el usuario solo quiere ver la consola de uvicorn.
:: Ya que el frontend lo sirve FastAPI desde /frontend (static files), solo necesitamos levantar uvicorn.

echo Levantando servidor en http://localhost:8000
echo Presiona Ctrl+C para detener el servidor.
echo.

:: Abrir navegador en localhost:8000 
start http://localhost:8000

python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
