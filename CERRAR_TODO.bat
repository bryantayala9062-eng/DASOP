@echo off
echo ==========================================
echo Cerrando todas las terminales y servicios del ERP...
echo ==========================================

echo Deteniendo servidor Backend (Python)...
taskkill /F /IM python.exe /T >nul 2>&1

echo Deteniendo servidor Frontend (Node)...
taskkill /F /IM node.exe /T >nul 2>&1

echo Deteniendo Tunel (Cloudflare)...
taskkill /F /IM cloudflared.exe /T >nul 2>&1

echo Cerrando ventanas de terminal...
taskkill /F /IM cmd.exe /T >nul 2>&1

echo Listo.
timeout /t 2 >nul
