# Instalación manual desde la terminal (sin venv)

Sigue estos pasos directamente en `\\serveri\Compacw\Documentos\PORTAL_ERP`.

## Backend (Python global)

```bat
pushd "\\serveri\Compacw\Documentos\PORTAL_ERP\backend"
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
popd
```

## Frontend (Node)

```bat
pushd "\\serveri\Compacw\Documentos\PORTAL_ERP\frontend"
npm install --legacy-peer-deps
popd
```

## Lanzar manualmente

```bat
pushd "\\serveri\Compacw\Documentos\PORTAL_ERP"
start "ERP_Backend" cmd /k "pushd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8010"
start "ERP_Frontend" cmd /k "pushd frontend && npm run dev"
```

Notas:
- Si `python` o `npm` no están en PATH, instala usando `winget install -e --id Python.Python.3.11` y `winget install -e --id OpenJS.NodeJS`.
- `pushd/popd` ayudan a trabajar sobre el recurso UNC sin mapear unidades.
