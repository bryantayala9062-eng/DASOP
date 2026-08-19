from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
import os

from api.dashboard.data_engine import DataEngine
from api.dashboard.nlp_engine import NLPEngine
try:
    db = DataEngine()
except ImportError:
    db = None

from core.security import require_mod_dashboard
from models.all_models import Usuario, Contrato
from api.dashboard.config import get_settings

# DB session helper (usado para enriquecer nodos con info de contratos)
from core.database import get_db
from sqlalchemy.orm import Session
from sqlalchemy import func

router = APIRouter(prefix="/api/dashboard", tags=["dashboard_xml"])


def get_engine():
    """Devuelve el DataEngine, recargando automáticamente si el Excel cambió en disco."""
    if not db:
        raise HTTPException(status_code=500, detail="Dashboard DataEngine no disponible")
    
    # Auto-reload: comparar mtime del Excel con el que se cargó en memoria
    try:
        settings = get_settings()
        if os.path.exists(settings.file_path):
            current_mtime = os.path.getmtime(settings.file_path)
            last_mtime = getattr(db, '_loaded_mtime', None)
            if last_mtime is None or current_mtime != last_mtime:
                print(f"[AUTO-RELOAD] Excel cambió (mtime {last_mtime} -> {current_mtime}). Recargando...")
                db.reload_data()
                db._loaded_mtime = current_mtime
    except Exception as _e:
        print(f"[AUTO-RELOAD] Error en chequeo de mtime: {_e}")

    return db


# ============================================================
#  MAIN KPIS & FILTERS
# ============================================================

@router.get("/")
def get_dashboard_kpis(
    empresa: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    folio: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_kpis(empresa, cliente, startDate, endDate, status, folio)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/filters")
def get_filters(
    lens: Optional[str] = Query(None),
    sortBy: Optional[str] = Query(None),
    empresa: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_filters_data(lens=lens, empresa=empresa, cliente=cliente)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/nlp-parse")
def parse_nlp_query(q: str = Query(...), current_user: Usuario = Depends(require_mod_dashboard)):
    try:
        engine = NLPEngine(get_engine())
        result = engine.parse_query(q)
        return {"filters": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/info")
def get_dashboard_info(current_user: Usuario = Depends(require_mod_dashboard)):
    """
    Obtiene información del estado actual del dashboard (última carga, etc.)
    
    Requiere permisos de módulo Dashboard.
    
    Returns:
        dict: Información del sistema (last_loaded_at, file_modified_at, counts, etc.)
    """
    try:
        engine = get_engine()
        from api.dashboard.config import get_settings
        import os
        from datetime import datetime
        
        # Obtener la fecha de modificación del archivo Excel
        settings = get_settings()
        file_modified_at = None
        if os.path.exists(settings.file_path):
            mtime = os.path.getmtime(settings.file_path)
            file_modified_at = datetime.fromtimestamp(mtime).isoformat()
        
        info = {
            "last_loaded_at": engine.last_loaded_at if hasattr(engine, 'last_loaded_at') else None,
            "file_modified_at": file_modified_at,
            "file_path": settings.file_path,
            "facturas_count": len(engine.df_facturas) if hasattr(engine, 'df_facturas') else 0,
            "complementos_count": len(engine.df_complementos) if hasattr(engine, 'df_complementos') else 0,
            "conceptos_count": len(engine.df_conceptos) if hasattr(engine, 'df_conceptos') else 0,
            "canceladas_count": len(engine.df_canceladas) if hasattr(engine, 'df_canceladas') else 0,
        }
        
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reload")
def reload_dashboard_data(current_user: Usuario = Depends(require_mod_dashboard)):
    """
    Recarga los datos del archivo Excel sin reiniciar el servidor.
    
    Requiere permisos de módulo Dashboard.
    
    Returns:
        dict: Información sobre la recarga (timestamp, registros, duración)
    """
    try:
        engine = get_engine()
        reload_info = engine.reload_data()
        
        return {
            "success": True,
            "message": "Datos recargados exitosamente",
            "user": current_user.username,
            "data": reload_info
        }
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=404, 
            detail=f"Archivo Excel no encontrado: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error al recargar datos: {str(e)}"
        )


# ============================================================
#  ANALYTICS
# ============================================================

@router.get("/analytics/trend")
def get_trend(
    empresa: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    folio: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_trend_data(empresa, cliente, startDate, endDate, status, folio)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/collection-metrics")
def get_collection_metrics(
    empresa: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    folio: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_collection_metrics(empresa, cliente, startDate, endDate, status, folio)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/slow-payers")
def get_slow_payers(
    empresa: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    folio: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_slow_payers(empresa, cliente, startDate, endDate, status, folio)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/income-mix")
def get_income_mix(current_user: Usuario = Depends(require_mod_dashboard)):
    try:
        return get_engine().get_income_mix()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/hhi")
def get_hhi(current_user: Usuario = Depends(require_mod_dashboard)):
    try:
        return get_engine().get_hhi_distribution()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/product-service-ratio")
def get_product_service_ratio(current_user: Usuario = Depends(require_mod_dashboard)):
    try:
        return get_engine().get_product_service_ratio()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/product-service-ratio/{tipo}")
def get_product_service_drilldown(
    tipo: str,
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_product_service_drilldown(tipo)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analytics/concept-invoices")
def get_concept_invoices(
    body: dict,
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        tipo = body.get("tipo", "")
        descripcion = body.get("descripcion", "")
        clave_sat = body.get("clave_sat")
        if not tipo or not descripcion:
            raise HTTPException(status_code=400, detail="tipo and descripcion are required")
        return get_engine().get_concept_invoices(tipo, descripcion, clave_sat)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/pareto")
def get_pareto(current_user: Usuario = Depends(require_mod_dashboard)):
    try:
        return get_engine().get_pareto_distribution()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/price-anomalies")
def get_price_anomalies(threshold: float = Query(3.0), current_user: Usuario = Depends(require_mod_dashboard)):
    try:
        return get_engine().get_price_anomalies(threshold)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))





@router.get("/analytics/ppd-pue-ratio")
def get_ppd_pue_ratio(
    empresa: Optional[str] = None,
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_ppd_pue_ratio(empresa, startDate, endDate)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/geographic")
def get_geographic_sales(
    empresa: Optional[str] = None,
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_geographic_sales(empresa, startDate, endDate)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/ppd-lifecycle")
def get_ppd_lifecycle(
    empresa: Optional[str] = None,
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_ppd_lifecycle(empresa, startDate, endDate)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
#  TEMPORAL ANALYSIS
# ============================================================

@router.get("/analytics/year-comparison")
def get_year_comparison(
    empresa: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_year_comparison(empresa, startDate, endDate)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/company-trend")
def get_company_trend(current_user: Usuario = Depends(require_mod_dashboard)):
    try:
        return get_engine().get_company_monthly_trend()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/collection-days")
def get_collection_days(current_user: Usuario = Depends(require_mod_dashboard)):
    try:
        return get_engine().get_collection_days_trend()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/seasonality")
def get_seasonality(current_user: Usuario = Depends(require_mod_dashboard)):
    try:
        return get_engine().get_seasonality_analysis()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/aging")
def get_aging(
    empresa: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_aging_report(empresa, startDate, endDate)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
#  COMPLEMENTOS & INVOICES
# ============================================================

@router.get("/complementos")
def get_complementos(
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=10, le=500),
    empresa: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None),
    folio: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_complementos_table(page=page, limit=limit, empresa=empresa, cliente=cliente, folio=folio)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/invoices")
def get_invoices(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=10, le=100000),
    empresa: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None),
    concepto: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    folio: Optional[str] = Query(None),
    lens: Optional[str] = Query(None),
    sortBy: Optional[str] = Query(None),
    sortDir: Optional[str] = Query('desc'),
    agingStatus: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    print(f"[API INVOICES] status={status}, sortDir={sortDir}, page={page}")
    try:
        return get_engine().get_invoices_table(
            page=page, limit=limit,
            empresa=empresa, cliente=cliente, concepto=concepto,
            start_date=startDate, end_date=endDate,
            status=status, folio=folio, lens=lens,
            sort_dir=sortDir or 'desc',
            sort_by=sortBy,
            aging_status=agingStatus
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/invoices/{folio}")
def get_invoice_detail(folio: str, current_user: Usuario = Depends(require_mod_dashboard)):
    try:
        result = get_engine().get_invoice_detail(folio)
        if result is None:
            raise HTTPException(status_code=404, detail="Factura no encontrada")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
#  SAT RISK
# ============================================================

@router.get("/risk/clients")
def get_risk_clients(limit: int = Query(20, ge=1, le=100), current_user: Usuario = Depends(require_mod_dashboard)):
    try:
        return get_engine().get_risk_clients(limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/risk/claves")
def get_risk_claves(current_user: Usuario = Depends(require_mod_dashboard)):
    try:
        return get_engine().get_risk_claves()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/risk/materiality")
def get_materiality_alerts(
    threshold: float = Query(0.35, ge=0.0, le=1.0),
    max_results: int = Query(15, ge=1, le=100),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_materiality_alerts(threshold=threshold, max_results=max_results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/risk/diagnostic")
def get_risk_diagnostic(
    empresa: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_risk_diagnostic(empresa, startDate, endDate)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/risk/full-scan")
def get_risk_full_scan(
    empresa: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    """Run all 8 SAT risk detection engines and return consolidated report."""
    try:
        return get_engine().get_full_risk_scan(empresa, cliente, startDate, endDate)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




# ============================================================
#  AUDIT
# ============================================================


@router.get("/audit/efos-risks")
def get_efos_risks(current_user: Usuario = Depends(require_mod_dashboard)):
    try:
        return get_engine().get_efos_risks()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audit/ppd-discrepancies")
def get_ppd_discrepancies(current_user: Usuario = Depends(require_mod_dashboard)):
    try:
        return get_engine().get_ppd_discrepancies()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
#  COMPANY VIEW
# ============================================================

@router.get("/empresas")
def get_companies_summary(
    empresa: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_companies_summary(empresa, startDate, endDate)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/empresas/{empresa}/stats")
def get_company_stats(
    empresa: str,
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        result = get_engine().get_company_stats(empresa, startDate=startDate, endDate=endDate)
        if result is None:
            raise HTTPException(status_code=404, detail="Empresa no encontrada")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/contratos")
def get_contratos_for_empresa(
    nombre: Optional[str] = Query(None, description="Nombre de empresa o cliente (busca en ambos campos)"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db_session: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mod_dashboard),
):
    """
    Devuelve contratos donde 'nombre' aparece como empresa OR cliente (case-insensitive).
    Protegido con permisos de Dashboard. Soporta paginación.
    Retorna { total, page, limit, items }.
    """
    from datetime import datetime
    from sqlalchemy import or_

    def _calcular_dias(fecha_actualizacion):
        if not fecha_actualizacion:
            return 0
        return (datetime.utcnow() - fecha_actualizacion).days

    query = db_session.query(Contrato)
    if nombre:
        pattern = f"%{nombre}%"
        query = query.filter(
            or_(
                Contrato.empresa.ilike(pattern),
                Contrato.cliente.ilike(pattern),
            )
        )

    total = query.count()
    contratos = (
        query
        .order_by(Contrato.fecha_actualizacion.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": [
            {
                "id": c.id,
                "cliente": c.cliente,
                "empresa": c.empresa,
                "tipo_contrato": c.tipo_contrato,
                "responsable_interno": c.responsable_interno,
                "estatus": c.estatus,
                "fecha_creacion": c.fecha_creacion,
                "fecha_actualizacion": c.fecha_actualizacion,
                "dias_en_estatus": _calcular_dias(c.fecha_actualizacion),
                "archivo_path": c.archivo_path,
            }
            for c in contratos
        ],
    }


@router.get("/contratos/{contract_id}/archivo")
def descargar_archivo_contrato(
    contract_id: int,
    db_session: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mod_dashboard),
):
    """Descarga el archivo adjunto de un contrato. Requiere permisos de Dashboard."""
    import os
    from fastapi.responses import FileResponse
    c = db_session.query(Contrato).filter(Contrato.id == contract_id).first()
    if not c or not c.archivo_path:
        raise HTTPException(status_code=404, detail="Este contrato no tiene archivo adjunto")
    if not os.path.exists(c.archivo_path):
        raise HTTPException(status_code=404, detail="El archivo físico no se encuentra en el servidor")
    return FileResponse(c.archivo_path, filename=os.path.basename(c.archivo_path))


@router.get("/analytics/network")
def get_billing_network(
    empresa: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    min_weight: int = Query(1000, ge=0),
    limit: int = Query(100, ge=10, le=1000),
    lens: str = Query("total"),
    db_session: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mod_dashboard)
) -> dict:
    """Devuelve la topología de facturación y añade conteos de contratos por nodo.

    Se agrupan los contratos por 'empresa' y por 'cliente' para evitar consultas N+1 y
    luego se inyectan los campos 'contracts_count', 'pending_contracts' y
    'has_pending_contracts' en cada nodo.
    """
    try:
        result = get_engine().get_billing_network(empresa=empresa, start_date=startDate, end_date=endDate, min_weight=min_weight, limit=limit, lens=lens)

        # Si no hay nodos, devolvemos directamente
        nodes = result.get('nodes', []) if isinstance(result, dict) else []
        if not nodes:
            return result

        try:
            # Contar contratos agrupados por empresa y por cliente
            # Build normalized lookup dictionaries to avoid mismatches due to case/whitespace
            import unicodedata
            def _normalize_key(s):
                try:
                    if s is None:
                        return ''
                    # Normalize to NFKD, remove diacritics, collapse whitespace and uppercase
                    raw = str(s)
                    nfkd = unicodedata.normalize('NFKD', raw)
                    without_diacritics = ''.join([c for c in nfkd if not unicodedata.combining(c)])
                    return ' '.join(without_diacritics.split()).strip().upper()
                except Exception:
                    try:
                        return str(s).strip().upper()
                    except Exception:
                        return s

            raw_emp = db_session.query(Contrato.empresa, func.count(Contrato.id)).group_by(Contrato.empresa).all()
            raw_cli = db_session.query(Contrato.cliente, func.count(Contrato.id)).group_by(Contrato.cliente).all()

            emp_counts = { _normalize_key(k): v for k, v in raw_emp }
            cli_counts = { _normalize_key(k): v for k, v in raw_cli }

            raw_pending_emp = db_session.query(Contrato.empresa, func.count(Contrato.id)).filter(Contrato.estatus != "8_FINALIZADO").group_by(Contrato.empresa).all()
            raw_pending_cli = db_session.query(Contrato.cliente, func.count(Contrato.id)).filter(Contrato.estatus != "8_FINALIZADO").group_by(Contrato.cliente).all()

            pending_emp_counts = { _normalize_key(k): v for k, v in raw_pending_emp }
            pending_cli_counts = { _normalize_key(k): v for k, v in raw_pending_cli }

            for n in nodes:
                label = n.get('label') or n.get('name') or n.get('id')
                if label is None:
                    n['contracts_count'] = 0
                    n['pending_contracts'] = 0
                    n['has_pending_contracts'] = False
                    continue

                norm_label = _normalize_key(label)
                total = int(emp_counts.get(norm_label, 0) + cli_counts.get(norm_label, 0))
                pending = int(pending_emp_counts.get(norm_label, 0) + pending_cli_counts.get(norm_label, 0))

                n['contracts_count'] = total
                n['pending_contracts'] = pending
                n['has_pending_contracts'] = pending > 0
        except Exception as _inner_e:
            # No bloqueamos la API si el enriquecimiento falla; lo logueamos y devolvemos la topología original
            print(f"[WARN] No se pudieron calcular contratos por nodo: {_inner_e}")

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/risk-carrusel")
def get_risk_carrusel(
    empresa: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_carrusel_risk(empresa=empresa, start_date=startDate, end_date=endDate)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/risk-efos")
def get_risk_efos(
    empresa: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    min_empresas: int = Query(3, ge=2),
    current_user: Usuario = Depends(require_mod_dashboard)
):
    try:
        return get_engine().get_efos_risk(empresa=empresa, start_date=startDate, end_date=endDate, min_empresas=min_empresas)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
