## Integración Sistema_Contratos → Portal ERP

Esta nota documenta cómo se sincronizan los contratos capturados en Streamlit (Excel `Gestion_Contratos_DB.xlsx`) con la base de datos del módulo Legal del Portal ERP.

### Rutas Autorizadas

- **Excel origen:** `C:/Users/datao/Desktop/Sistema_Contratos/base_datos/Gestion_Contratos_DB.xlsx`
- **Backend destino:** `\\serveri\Compacw\Documentos\PORTAL_ERP`

### Hojas Consumidas

- `Registro_Personas_Morales`
- `Registro_Personas_Fisicas`

### Mapeo De Campos

| Excel | Portal (tabla `contratos`) |
|-------|-----------------------------|
| `ID` + prefijo (`PM`/`PF`) | `external_id` |
| `Cliente` | `cliente` |
| `Representante_Cliente` | `representante_cliente` (nuevo campo) |
| `Empresa` | `empresa` (nuevo campo) |
| `Tipo_Contrato` (`Concepto` como fallback) | `tipo_contrato` |
| `Concepto` | `concepto` |
| `Periodo` | `periodo` |
| `Clave_Periodo` | `clave_periodo` |
| `Fecha_Inicio` | `fecha_inicio` |
| `Fecha_Fin` | `fecha_fin` |
| `Estado` | `estatus` (ver sección siguiente) |
| `Link` | `link_documento` + `archivo_path` |
| `Fecha_Creacion` | `fecha_creacion` |
| `Fecha_Ultimo_Cambio` | `fecha_actualizacion` |
| `Notas` | `notas` + registro opcional en Bitácora |

### Conversión De Estados

| Streamlit | Portal |
|-----------|--------|
| `1. Solicitud / Inicio` | `1_REDACCION_LEGAL` |
| `2. En Revisión Cliente (Vo.Bo)` | `2_TRANSITO_A_CLIENTE` |
| `3. Para Firma (Salida - Juan Carlos)` | `3_EN_PODER_CLIENTE` |
| `4. Firma Interna (Regreso Cliente)` | `4_RECOLECCION_CLIENTE` |
| `5. En Notaría` | `5_TRANSITO_A_NOTARIA` |
| `6. Archivado` | `8_FINALIZADO` |

Cualquier estado desconocido se marca como `1_REDACCION_LEGAL` para asegurar que el flujo continúe dentro del Portal.

### Identificadores

- `external_id` se construye concatenando el prefijo de la hoja (`PF`/`PM`) con el `ID` numérico del registro. Esto permite upserts idempotentes sin alterar la numeración original.
- Cada sincronización únicamente crea o actualiza registros cuyo `external_id` provenga del Excel.

### Próximos Pasos

1. Agregar campos nuevos al modelo `Contrato` para reflejar la información anterior.
2. Implementar servicio `StreamlitSyncService` que lea el Excel y actualice la base PostgreSQL del portal.
3. Programar tarea `apscheduler` en `backend/main.py` para ejecutar la sincronización periódica y generar bitácora en caso de cambios.
