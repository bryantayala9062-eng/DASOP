@echo off
title Tunel Cloudflare ERP
echo Iniciando Tunel de Cloudflare hacia tu Portal ERP...

:: Nos aseguramos de estar en el directorio correcto
pushd "%~dp0"

:: Verifica si el ejecutable existe, si no, le manda un error
if not exist "tools\cloudflared-windows-amd64.exe" (
    if not exist "tools\cloudflared.exe" (
        echo [ERROR] No se encuentra cloudflared-windows-amd64.exe ni cloudflared.exe en tools.
        echo Por favor, sigue la Fase 2 de docs\Guia_Cloudflare.md
        pause
        exit /b
    ) else (
        set "CLOUDFLARED_EXE=tools\cloudflared.exe"
    )
) else (
    set "CLOUDFLARED_EXE=tools\cloudflared-windows-amd64.exe"
)

:: Ejecuta el túnel usando el archivo de configuración global (config.yml)
"%CLOUDFLARED_EXE%" tunnel --config "%USERPROFILE%\.cloudflared\config.yml" run portal-dashop-prod

pause
