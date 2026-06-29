@echo off
setlocal EnableExtensions EnableDelayedExpansion
echo ====================================================
echo Instalador Automatico 24/7 - Portal ERP
echo ====================================================
echo.

set "INSTALL_FAILED=0"
set "ERROR_TEXT="

:: ------------------------------------------------------------------
:: SEGURO 24/7: Forzamos directorio absoluto usando PUSHD para soportar
:: rutas UNC incluso si el script se ejecuta desde un recurso compartido.
:: ------------------------------------------------------------------
pushd "%~dp0..\app" >nul 2>&1
if errorlevel 1 (
    set "INSTALL_FAILED=1"
    set "ERROR_TEXT=No se pudo acceder al directorio del instalador (%~dp0)."
    goto :finish
)
set "RESTORE_DIR=1"

echo [1/4] Comprobando Python...
python --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Instalando la ultima version automaticamente usando Winget...
    winget install -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements
    IF %ERRORLEVEL% NEQ 0 (
        set "INSTALL_FAILED=1"
        set "ERROR_TEXT=No se pudo instalar Python automaticamente."
        goto :finish
    )
) ELSE (
    echo Python detectado correctamente.
)

echo.
echo [2/4] Comprobando Node.js (NPM)...
node --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Node.js no esta instalado. Instalando con Winget...
    winget install -e --id OpenJS.NodeJS --accept-package-agreements --accept-source-agreements
    IF %ERRORLEVEL% NEQ 0 (
        set "INSTALL_FAILED=1"
        set "ERROR_TEXT=No se pudo instalar Node.js automaticamente."
        goto :finish
    )
) ELSE (
    echo Node.js detectado correctamente.
)

echo.
echo [3/4] Instalando Backend (Python global)...
set "BACKEND_DIR=%~dp0..\app\backend"
pushd "%BACKEND_DIR%" >nul 2>&1
IF errorlevel 1 (
    set "INSTALL_FAILED=1"
    set "ERROR_TEXT=No se pudo acceder a la carpeta backend."
    goto :finish
)
echo Actualizando pip global...
python -m pip install --upgrade pip >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    set "INSTALL_FAILED=1"
    set "ERROR_TEXT=No se pudo actualizar pip global."
    goto :finish
)
echo Instalando requerimientos del backend en el entorno global...
python -m pip install -r "%BACKEND_DIR%\requirements.txt"
IF %ERRORLEVEL% NEQ 0 (
    set "INSTALL_FAILED=1"
    set "ERROR_TEXT=Ocurrio un error instalando los requerimientos del backend (pip global)."
    goto :finish
)
popd >nul 2>&1

echo.
echo [4/4] Instalando Frontend (React/Node)...
pushd "%~dp0..\app\frontend" >nul 2>&1
IF errorlevel 1 (
    set "INSTALL_FAILED=1"
    set "ERROR_TEXT=No se pudo acceder a la carpeta frontend."
    goto :finish
)
echo Descargando dependencias de interfaz...
call npm install --legacy-peer-deps
IF %ERRORLEVEL% NEQ 0 (
    set "INSTALL_FAILED=1"
    set "ERROR_TEXT=Fallo la instalacion de dependencias del frontend (npm)."
    goto :finish
)
popd >nul 2>&1

goto :finish

:finish
echo.
IF %INSTALL_FAILED% NEQ 0 (
    echo ====================================================
    echo  ¡INSTALACION INCOMPLETA!
    echo ====================================================
    IF defined ERROR_TEXT (
        echo  Detalle: %ERROR_TEXT%
    ) ELSE (
        echo  Revise la salida anterior para mas informacion.
    )
    echo.
    echo  Corrige el problema y vuelve a ejecutar este instalador.
) ELSE (
    echo ====================================================
    echo ¡INSTALACION COMPLETA!
    echo ====================================================
    echo Todo se instalo dentro de sus respectivas carpetas virtuales.
    echo Tu servidor principal no sufrira conflictos de versiones globales.
    echo.
    echo Instalacion exitosa. Presiona cualquier tecla para cerrar esta ventana.
)
echo.
pause
IF defined RESTORE_DIR popd
endlocal
exit /b %INSTALL_FAILED%
