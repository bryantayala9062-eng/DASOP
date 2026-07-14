import pandas as pd  # type: ignore
import os
from datetime import datetime
from math import ceil

import numpy as np  # type: ignore

from api.dashboard.config import get_settings


try:  # pragma: no cover
    from api.dashboard.risk_analyzer import build_risk_analyzer

    from api.dashboard.aging_report import AgingReport
    from api.dashboard.concentration_analyzer import ConcentrationAnalyzer
    from api.dashboard.anomaly_detector import AnomalyDetector
    from api.dashboard.price_audit import PriceAuditor
    from api.dashboard.sat_risk_engine import build_sat_risk_engine
except ImportError as exc:  # type: ignore
    raise ImportError("backend package is required to load risk analyzer modules") from exc

SETTINGS = get_settings()

COLLECTION_BUCKETS = [
    ("0-30 días", 0, 30),
    ("31-60 días", 31, 60),
    ("61-90 días", 61, 90),
    ("+90 días", 91, None),
]



class DataEngine:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DataEngine, cls).__new__(cls)
            cls._instance.load_data()
        return cls._instance

    def reload_data(self):
        """
        Fuerza la recarga de datos desde el archivo Excel.
        Útil cuando el archivo se actualiza sin reiniciar el servidor.
        
        Returns:
            dict: Información sobre la recarga (timestamp, filas cargadas, etc.)
        """
        start_time = datetime.now()
        
        import shutil
        cache_dir = os.path.join(os.path.dirname(__file__), ".cache_data")
        if os.path.exists(cache_dir):
            shutil.rmtree(cache_dir, ignore_errors=True)
            
        print(f"\n[RELOAD] Forzando recarga de datos a las {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Reiniciar flag de carga
        self.load_data()
        
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        # Recopilar estadísticas
        stats = {
            "timestamp": end_time.isoformat(),
            "last_loaded_at": self.last_loaded_at if hasattr(self, 'last_loaded_at') else end_time.isoformat(),
            "duration_seconds": round(duration, 2),
            "facturas_count": len(self.df_facturas) if hasattr(self, 'df_facturas') else 0,
            "complementos_count": len(self.df_complementos) if hasattr(self, 'df_complementos') else 0,
            "conceptos_count": len(self.df_conceptos) if hasattr(self, 'df_conceptos') else 0,
            "canceladas_count": len(self.df_canceladas) if hasattr(self, 'df_canceladas') else 0,
            "file_path": SETTINGS.file_path,
            "status": "success"
        }
        
        print(f"[RELOAD] Recarga completada en {duration:.2f}s")
        return stats

    def load_data(self):
        print(f"Loading data from {SETTINGS.file_path}...")
        self.risk_analyzer = None
        
        # Guardar timestamp de carga
        load_start = datetime.now()
        
        # 1. Validar que el archivo exista
        if not os.path.exists(SETTINGS.file_path):
            print(f"[Error] No se encontro el archivo {SETTINGS.file_path}")
            self._set_empty_data()
            self.last_loaded_at = load_start.isoformat()
            return
            
        import pickle
        import hashlib
        cache_dir = os.path.join(os.path.dirname(__file__), ".cache_data")
        os.makedirs(cache_dir, exist_ok=True)
        cache_meta_path = os.path.join(cache_dir, "cache_meta.json")
        
        ultima_modificacion = os.path.getmtime(SETTINGS.file_path)
        
        # 2. Revisar si podemos usar Caché Rápido
        use_cache = False
        if os.path.exists(cache_meta_path):
            try:
                import json
                with open(cache_meta_path, 'r') as f:
                    meta = json.load(f)
                if meta.get("mtime") == ultima_modificacion:
                    use_cache = True
            except Exception as e:
                print(f"Cache check error: {e}")
                
        if use_cache:
            print("[Cache] Cargando datos desde Cache (Super Rapido)...")
            try:
                self.df_facturas = pd.read_pickle(os.path.join(cache_dir, "facturas.pkl"))
                self.df_complementos = pd.read_pickle(os.path.join(cache_dir, "complementos.pkl"))
                self.df_conceptos = pd.read_pickle(os.path.join(cache_dir, "conceptos.pkl"))
                cancel_pkl = os.path.join(cache_dir, "canceladas.pkl")
                self.df_canceladas = pd.read_pickle(cancel_pkl) if os.path.exists(cancel_pkl) else pd.DataFrame()
                print("Data loaded from cache successfully.")
                self.risk_analyzer = build_risk_analyzer(self)
                self.last_loaded_at = datetime.now().isoformat()
                return
            except Exception as e:
                print(f"Error reading cache: {e}. Fallback a leer el Excel.")
        
        # 3. Procesamiento Pesado
        print(f"[Procesando] Nuevo Excel desde {SETTINGS.file_path}...")
        try:
            with pd.ExcelFile(SETTINGS.file_path) as xl:
                # Validar hojas requeridas
                sheet_names = xl.sheet_names
                if 'Facturas' not in sheet_names or 'Complementos' not in sheet_names:
                    print("[Error] El Excel debe contener al menos las hojas 'Facturas' y 'Complementos'.")
                    self._set_empty_data()
                    return
                
                # Load main sheets
                self.df_facturas = pd.read_excel(xl, sheet_name='Facturas')
                self.df_complementos = pd.read_excel(xl, sheet_name='Complementos')
                
                try:
                    if 'Conceptos' in sheet_names:
                        self.df_conceptos = pd.read_excel(xl, sheet_name='Conceptos')
                    else:
                        self.df_conceptos = pd.DataFrame()
                except Exception:
                    self.df_conceptos = pd.DataFrame()

                try:
                    if 'Canceladas' in sheet_names:
                        self.df_canceladas = pd.read_excel(xl, sheet_name='Canceladas')
                    else:
                        self.df_canceladas = pd.DataFrame()
                except Exception:
                    self.df_canceladas = pd.DataFrame()
            
            # Clean Dates
            if 'FECHA' in self.df_facturas.columns:
                self.df_facturas['FECHA'] = pd.to_datetime(self.df_facturas['FECHA'], errors='coerce')
            if 'FECHA PAGO' in self.df_complementos.columns:
                self.df_complementos['FECHA PAGO'] = pd.to_datetime(self.df_complementos['FECHA PAGO'], errors='coerce')
            if not self.df_conceptos.empty and 'FECHA' in self.df_conceptos.columns:
                self.df_conceptos['FECHA'] = pd.to_datetime(self.df_conceptos['FECHA'], errors='coerce')

            # Clean Numeric
            metric_cols = ['TOTAL NETO', 'SALDO PENDIENTE', 'TOTAL PAGADO', 'TOTAL ANTES DE IVA']
            for col in metric_cols:
                if col in self.df_facturas.columns:
                    if self.df_facturas[col].dtype == object:
                        self.df_facturas[col] = self.df_facturas[col].astype(str).str.replace(r'[$,]', '', regex=True)
                    self.df_facturas[col] = pd.to_numeric(self.df_facturas[col], errors='coerce').fillna(0)

            if not self.df_conceptos.empty:
                if 'IMPORTE' in self.df_conceptos.columns:
                    if self.df_conceptos['IMPORTE'].dtype == object:
                        self.df_conceptos['IMPORTE'] = self.df_conceptos['IMPORTE'].astype(str).str.replace(r'[$,]', '', regex=True)
                    self.df_conceptos['IMPORTE'] = pd.to_numeric(self.df_conceptos['IMPORTE'], errors='coerce').fillna(0)
                if 'CLAVE PROD/SERV' in self.df_conceptos.columns:
                    self.df_conceptos['CLAVE PROD/SERV'] = pd.to_numeric(self.df_conceptos['CLAVE PROD/SERV'], errors='coerce').fillna(0).astype(int)
            
            # 4. Guardar en Caché para la próxima vez
            try:
                self.df_facturas.to_pickle(os.path.join(cache_dir, "facturas.pkl"))
                self.df_complementos.to_pickle(os.path.join(cache_dir, "complementos.pkl"))
                self.df_conceptos.to_pickle(os.path.join(cache_dir, "conceptos.pkl"))
                self.df_canceladas.to_pickle(os.path.join(cache_dir, "canceladas.pkl"))
                import json
                with open(cache_meta_path, 'w') as f:
                    json.dump({"mtime": ultima_modificacion}, f)
            except Exception as e:
                print(f"[Aviso] No se pudo guardar la cache: {e}")
                
            print("Data loaded and cached successfully.")
            self.risk_analyzer = build_risk_analyzer(self)
            self.last_loaded_at = datetime.now().isoformat()
        except Exception as e:
            print(f"Error loading data: {e}")
            self._set_empty_data()
            self.last_loaded_at = datetime.now().isoformat()
        
        # Guardar mtime actual del archivo para comparación de auto-reload
        try:
            if os.path.exists(SETTINGS.file_path):
                self._loaded_mtime = os.path.getmtime(SETTINGS.file_path)
        except Exception:
            pass

    def _set_empty_data(self):
        self.df_facturas = pd.DataFrame()
        self.df_complementos = pd.DataFrame()
        self.df_conceptos = pd.DataFrame()
        self.df_canceladas = pd.DataFrame()
        self.risk_analyzer = None

    def _get_risk_analyzer(self):
        if self.df_conceptos.empty:
            return None
        if self.risk_analyzer is None:
            self.risk_analyzer = build_risk_analyzer(self)
        return self.risk_analyzer



    def get_full_risk_scan(self, empresa=None, cliente=None, startDate=None, endDate=None):
        """Run all 8 SAT risk detection engines and return consolidated report."""
        engine = build_sat_risk_engine(self)
        if engine is None:
            return {
                "score_global": 0,
                "nivel_riesgo": "SIN DATOS",
                "resumen": {"total_alertas": 0, "monto_comprometido": 0, "por_severidad": {}},
                "categorias": [],
            }
        return engine.run_full_scan(empresa, cliente, startDate, endDate)

    def apply_filters(self, df, empresa=None, cliente=None, start_date=None, end_date=None, status=None, folio=None):
        """Apply global filters to any dataframe"""
        filtered = df.copy()
        
        if empresa and empresa.strip():
            filtered = filtered[filtered['EMPRESA'] == empresa]
        
        if cliente and cliente.strip():
            filtered = filtered[filtered['CLIENTE'].str.contains(cliente, case=False, na=False)]
        
        if start_date:
            if str(start_date).startswith("years:"):
                try:
                    years_str = str(start_date).replace("years:", "")
                    year_list = [int(y.strip()) for y in years_str.split(',')]
                    filtered = filtered[filtered['FECHA'].dt.year.isin(year_list)]
                except:
                    pass
            else:
                try:
                    start = pd.to_datetime(start_date)
                    filtered = filtered[filtered['FECHA'] >= start]
                except:
                    pass
        
        if end_date:
            try:
                end = pd.to_datetime(end_date)
                filtered = filtered[filtered['FECHA'] <= end]
            except:
                pass
        
        if status and status != 'ALL':
            if 'ESTATUS DE COBRO' in filtered.columns:
                status_list = [s.strip().upper() for s in str(status).split(',') if s.strip()]
                if status_list:
                    col_norm = filtered['ESTATUS DE COBRO'].astype(str).str.strip().str.upper()
                    filtered = filtered[col_norm.isin(status_list)]
        
        if folio and folio.strip():
            filtered = filtered[filtered['FOLIO'].str.contains(folio, case=False, na=False)]
        
        return filtered

    def get_kpis(self, empresa=None, cliente=None, start_date=None, end_date=None, status=None, folio=None):
        """Returns main executive KPIs"""
        if self.df_facturas.empty:
            return {
                "total_ventas": 0,
                "total_facturas": 0,
                "saldo_pendiente": 0,
                "tasa_cancelacion": 0,
                "total_canceladas": 0,
                "concentracion_top_10": 0
            }
        
        df = self.apply_filters(self.df_facturas, empresa, cliente, start_date, end_date, status, folio)
        if df.empty:
            return {
                "total_ventas": 0,
                "total_facturas": 0,
                "saldo_pendiente": 0,
                "tasa_cancelacion": 0,
                "total_canceladas": 0,
                "concentracion_top_10": 0
            }

        total_ventas = float(df['TOTAL NETO'].sum())
        total_facturas = len(df)
        saldo_pendiente = float(df['SALDO PENDIENTE'].sum())
        
        # Calcular canceladas desde df_canceladas
        total_canceladas = 0
        if hasattr(self, 'df_canceladas') and not self.df_canceladas.empty:
            df_canc = self.apply_filters(self.df_canceladas, empresa, cliente, start_date, end_date, status, folio)
            total_canceladas = len(df_canc)
            
        total_facturas_all = total_facturas + total_canceladas
        tasa_cancelacion = round((total_canceladas / total_facturas_all * 100), 1) if total_facturas_all > 0 else 0
        
        if 'CLIENTE' in df.columns:
            top_10 = df.groupby('CLIENTE')['TOTAL NETO'].sum().nlargest(10).sum()
            concentracion_top_10 = round((top_10 / total_ventas * 100), 1) if total_ventas > 0 else 0
        else:
            concentracion_top_10 = 0

        return {
            "total_ventas": total_ventas,
            "total_facturas": total_facturas,
            "saldo_pendiente": saldo_pendiente,
            "tasa_cancelacion": tasa_cancelacion,
            "total_canceladas": total_canceladas,
            "concentracion_top_10": concentracion_top_10
        }

    def get_trend_data(self, empresa=None, cliente=None, start_date=None, end_date=None, status=None, folio=None):
        """Returns trend data"""
        if self.df_facturas.empty:
            return []
            
        df = self.apply_filters(self.df_facturas, empresa, cliente, start_date, end_date, status, folio)
        if df.empty:
            return []
            
        group_by_day = False
        if start_date and end_date:
            try:
                sd = pd.to_datetime(start_date)
                ed = pd.to_datetime(end_date)
                if (ed - sd).days <= 32:
                    group_by_day = True
            except:
                pass
                
        if group_by_day:
            df['TimeLabel'] = df['FECHA'].dt.strftime('%Y-%m-%d')
        else:
            df['TimeLabel'] = df['FECHA'].dt.to_period('M').astype(str)
        
        trend = df.groupby('TimeLabel').agg({
            'TOTAL NETO': 'sum',
            'UUID': 'count'
        }).reset_index()
        
        trend.columns = ['MonthYear', 'TOTAL NETO', 'INVOICE_COUNT']
        
        return trend.to_dict(orient='records')

    def get_slow_payers(self, empresa=None, cliente=None, start_date=None, end_date=None, status=None, folio=None):
        """Returns Top 10 Slow Payers logic"""
        if self.df_facturas.empty:
            return []

        df = self.apply_filters(self.df_facturas, empresa, cliente, start_date, end_date, status, folio)
        pending = df[df['SALDO PENDIENTE'] > 1].copy()
        
        if pending.empty:
            return []
            
        now = datetime.now()
        pending['DaysOpen'] = (now - pending['FECHA']).dt.days
        
        summary = pending.groupby('CLIENTE').agg({
            'SALDO PENDIENTE': 'sum',
            'DaysOpen': 'mean',
            'UUID': 'count'
        }).reset_index()
        
        summary.columns = ['cliente', 'saldo_pendiente', 'dias_promedio', 'facturas_pendientes']
        return summary.sort_values('dias_promedio', ascending=False).head(10).to_dict(orient='records')
    
    def get_complementos_table(
        self,
        page: int = 1,
        limit: int = 100,
        empresa: str | None = None,
        cliente: str | None = None,
        folio: str | None = None,
    ):
        """Returns paginated payment complements table"""

        base_meta = {
            "page": max(1, page),
            "limit": max(1, limit),
            "total_records": 0,
            "total_pages": 0,
            "aggregates": {"total_pagado": 0.0, "total_saldo": 0.0},
        }

        if self.df_complementos.empty:
            return {"data": [], "meta": base_meta}

        limit = max(10, min(limit, 500))
        page = max(1, page)

        cols = [
            'FOLIO PAGO (REP)',
            'FECHA PAGO',
            'EMPRESA',
            'CLIENTE',
            'FOLIO RELACIONADO',
            'NUM PARCIALIDAD',
            'IMPORTE PAGADO',
            'SALDO INSOLUTO',
        ]
        df = self.df_complementos[cols].copy()

        if empresa:
            df = df[df['EMPRESA'] == empresa]
        if cliente:
            df = df[df['CLIENTE'] == cliente]
        if folio:
            df = df[df['FOLIO PAGO (REP)'].astype(str).str.contains(folio, case=False, na=False)]

        if df.empty:
            meta = base_meta | {"limit": limit}
            return {"data": [], "meta": meta}

        df['IMPORTE PAGADO'] = pd.to_numeric(df['IMPORTE PAGADO'], errors='coerce').fillna(0)
        df['SALDO INSOLUTO'] = pd.to_numeric(df['SALDO INSOLUTO'], errors='coerce').fillna(0)

        total_records = len(df)
        total_pagado = float(df['IMPORTE PAGADO'].sum())
        total_saldo = float(df['SALDO INSOLUTO'].sum())
        total_pages = ceil(total_records / limit) if total_records else 0

        page = min(page, total_pages if total_pages > 0 else 1)
        start = (page - 1) * limit
        end = start + limit

        page_df = df.iloc[start:end].copy()
        page_df['FECHA PAGO'] = page_df['FECHA PAGO'].astype(str)

        meta = {
            "page": page,
            "limit": limit,
            "total_records": total_records,
            "total_pages": total_pages,
            "aggregates": {
                "total_pagado": total_pagado,
                "total_saldo": total_saldo,
            },
        }

        return {"data": page_df.to_dict(orient='records'), "meta": meta}

    def _empty_collection_metrics(self):
        return {
            "dso": 0.0,
            "period_days": 0,
            "average_daily_sales": 0.0,
            "receivables": 0.0,
            "overdue_balance": 0.0,
            "current_balance": 0.0,
            "total_sales": 0.0,
            "buckets": [
                {
                    "label": label,
                    "amount": 0.0,
                    "percentage": 0.0,
                    "range": {"start": start, "end": end},
                }
                for (label, start, end) in COLLECTION_BUCKETS
            ],
        }

    def get_collection_metrics(
        self,
        empresa=None,
        cliente=None,
        start_date=None,
        end_date=None,
        status=None,
        folio=None,
    ):
        if self.df_facturas.empty:
            return self._empty_collection_metrics()

        df = self.apply_filters(self.df_facturas, empresa, cliente, start_date, end_date, status, folio).copy()
        if df.empty:
            return self._empty_collection_metrics()

        df['FECHA'] = pd.to_datetime(df['FECHA'], errors='coerce')
        df = df.dropna(subset=['FECHA'])
        if df.empty:
            return self._empty_collection_metrics()

        df['SALDO PENDIENTE'] = pd.to_numeric(df['SALDO PENDIENTE'], errors='coerce').fillna(0)
        df['TOTAL NETO'] = pd.to_numeric(df['TOTAL NETO'], errors='coerce').fillna(0)

        now = datetime.now()
        df['DaysOpen'] = (now - df['FECHA']).dt.days.clip(lower=0)

        date_span = (df['FECHA'].max() - df['FECHA'].min()).days
        period_days = max(1, date_span + 1)

        total_sales = float(df['TOTAL NETO'].sum())
        receivables = float(df['SALDO PENDIENTE'].clip(lower=0).sum())
        average_daily_sales = float(total_sales / period_days) if period_days else float(total_sales)
        dso = round((receivables / average_daily_sales) if average_daily_sales > 0 else 0.0, 1)

        buckets = []
        for label, start, end in COLLECTION_BUCKETS:
            if end is None:
                mask = df['DaysOpen'] >= start
            else:
                mask = (df['DaysOpen'] >= start) & (df['DaysOpen'] <= end)
            amount = float(df.loc[mask, 'SALDO PENDIENTE'].clip(lower=0).sum())
            percentage = round((amount / receivables * 100), 1) if receivables > 0 else 0.0
            buckets.append({
                "label": label,
                "amount": amount,
                "percentage": percentage,
                "range": {"start": start, "end": end},
            })

        current_balance = buckets[0]['amount'] if buckets else 0.0
        overdue_balance = receivables - current_balance
        overdue_balance = max(0.0, overdue_balance)

        return {
            "dso": dso,
            "period_days": int(period_days),
            "average_daily_sales": round(average_daily_sales, 2),
            "receivables": receivables,
            "overdue_balance": overdue_balance,
            "current_balance": current_balance,
            "total_sales": total_sales,
            "buckets": buckets,
        }

    def _get_concentration_analyzer(self):
        if self.df_conceptos.empty:
            return None
        return ConcentrationAnalyzer(self.df_conceptos)

    def _get_anomaly_detector(self):
        return AnomalyDetector(self)

    def _get_price_auditor(self):
        if self.df_conceptos.empty:
            return None
        return PriceAuditor(self.df_conceptos)

    def get_price_anomalies(self, threshold: float = 3.0):
        auditor = self._get_price_auditor()
        if not auditor:
            return []
        return auditor.detect_overpricing(threshold_multiplier=threshold)

    def get_income_mix(self):
        analyzer = self._get_concentration_analyzer()
        if not analyzer:
            return []
        return analyzer.income_mix()

    def get_hhi_distribution(self):
        analyzer = self._get_concentration_analyzer()
        if not analyzer:
            return []
        return analyzer.hhi_index()

    def get_product_service_ratio(self):
        analyzer = self._get_concentration_analyzer()
        if not analyzer:
            return {"concept_mix": [], "invoice_donut": [], "invoice_detail": []}
        return analyzer.product_service_ratio(df_facturas=self.df_facturas)

    def get_product_service_drilldown(self, tipo: str):
        analyzer = self._get_concentration_analyzer()
        if not analyzer:
            return {"top_concepts": [], "top_invoices": []}
        return analyzer.get_product_service_drilldown(tipo=tipo, df_facturas=self.df_facturas)

    def get_concept_invoices(self, tipo: str, descripcion: str, clave_sat: str = None):
        analyzer = self._get_concentration_analyzer()
        if not analyzer:
            return {"invoices": [], "total": 0}
        return analyzer.get_concept_invoices(tipo=tipo, descripcion=descripcion, clave_sat=clave_sat, df_facturas=self.df_facturas)

    def get_pareto_distribution(self):
        df = self.df_facturas.copy()
        if df.empty:
            return []
        grouped = df.groupby('CLIENTE')['TOTAL NETO'].sum().reset_index().sort_values('TOTAL NETO', ascending=False)
        total = grouped['TOTAL NETO'].sum() or 1
        records = []
        cumulative = 0.0
        for _, row in grouped.iterrows():
            cumulative += row['TOTAL NETO']
            facturas = df[df['CLIENTE'] == row['CLIENTE']]
            records.append({
                'cliente': row['CLIENTE'],
                'total': float(row['TOTAL NETO']),
                'porcentaje_acumulado': round((cumulative / total) * 100, 1),
                'facturas': int(facturas['UUID'].nunique()),
            })
        return records[:50]

    # ========== SAT RISK ANALYZER METHODS ==========

    def get_risk_clients(self, limit: int = 20):
        analyzer = self._get_risk_analyzer()
        if not analyzer:
            return []
        limit = max(1, min(limit, 100))
        return [client.to_dict() for client in analyzer.get_top_risky_clients(limit)]

    def get_risk_claves(self):
        analyzer = self._get_risk_analyzer()
        if not analyzer:
            return {"top_claves": [], "high_risk_claves": []}
        return analyzer.get_clave_insights()

    def get_materiality_alerts(self, threshold: float = 0.35, max_results: int = 15):
        analyzer = self._get_risk_analyzer()
        if not analyzer:
            return []
        threshold = max(0.0, min(threshold, 1.0))
        max_results = max(1, min(max_results, 100))
        return analyzer.get_materiality_alerts(threshold=threshold, max_results=max_results)

    def get_billing_network(self, empresa=None, start_date=None, end_date=None, min_weight=1000, limit=100, lens="total"):
        """Returns a network graph representation of billing between EMPRESA and CLIENTE"""
        if self.df_facturas.empty:
            return {"nodes": [], "links": []}
            
        # We don't filter by cliente here because we want to see the whole network
        df = self.apply_filters(self.df_facturas, empresa, None, start_date, end_date)
        
        if df.empty:
            return {"nodes": [], "links": []}
            
        # Exclude cancelled invoices
        if 'ESTATUS DE COBRO' in df.columns:
            df = df[df['ESTATUS DE COBRO'] != 'Cancelado'].copy()

        value_col = 'TOTAL NETO'
        if lens == 'debt':
            if 'METODO PAGO' in df.columns:
                df = df[df['METODO PAGO'] == 'PPD'].copy()
            value_col = 'SALDO PENDIENTE'
        elif lens == 'intangibles' and not self.df_conceptos.empty:
            # Filter concepts starting with 80-85 (Services/Consulting)
            intangibles_conceptos = self.df_conceptos[self.df_conceptos['CLAVE PROD/SERV'].astype(str).str.startswith(('80', '81', '82', '83', '84', '85'))]
            if intangibles_conceptos.empty:
                return {"nodes": [], "links": []}
            intangibles_agg = intangibles_conceptos.groupby('UUID')['IMPORTE'].sum().reset_index()
            df = pd.merge(df, intangibles_agg, on='UUID', how='inner')
            value_col = 'IMPORTE'

        # Group by Source (EMPRESA) and Target (CLIENTE)
        links_df = df.groupby(['EMPRESA', 'CLIENTE'])[value_col].sum().reset_index()
        links_df = links_df[links_df[value_col] >= min_weight]
        
        if links_df.empty:
            return {"nodes": [], "links": []}
            
        # Build Nodes
        # Sources are 'Empresa', Targets are 'Cliente'
        unique_empresas = set(links_df['EMPRESA'].unique())
        unique_clientes = set(links_df['CLIENTE'].unique())
        
        # Pre-calculate node totals
        emp_vols = links_df.groupby('EMPRESA')[value_col].sum()
        cli_vols = links_df.groupby('CLIENTE')[value_col].sum()
        node_volumes = emp_vols.add(cli_vols, fill_value=0).to_dict()
            
        nodes = []
        for e in unique_empresas:
            nodes.append({
                "id": str(e), 
                "group": 1, 
                "label": str(e), 
                "type": "Emisor",
                "total_monto": node_volumes.get(str(e), 0)
            })
            
        for c in unique_clientes:
            if c not in unique_empresas:
                nodes.append({
                    "id": str(c), 
                    "group": 2, 
                    "label": str(c), 
                    "type": "Tercero",
                    "total_monto": node_volumes.get(str(c), 0)
                })
                
        # Build Links
        safe_limit = max(10, min(int(limit), 1000))
        links_df = links_df.sort_values(value_col, ascending=False).head(safe_limit)
        
        links = []
        for row in links_df.to_dict('records'):
            source = str(row['EMPRESA'])
            target = str(row['CLIENTE'])
            value = float(row[value_col])
            links.append({
                "source": source,
                "target": target,
                "value": value,
                "label": f"${value:,.2f}"
            })

        # Filter nodes to only those that exist in the top N links (prevent orphans)
        active_nodes = set()
        for link in links:
            active_nodes.add(link['source'])
            active_nodes.add(link['target'])
            
        nodes = [n for n in nodes if n['id'] in active_nodes]

        return {"nodes": nodes, "links": links}


    def get_risk_diagnostic(self, empresa=None, start_date=None, end_date=None):
        analyzer = self._get_risk_analyzer()
        if not analyzer:
            return {
                "summary": {
                    "total_clients": 0,
                    "level_counts": {},
                    "factor_counts": {},
                    "average_score": 0,
                    "total_importe": 0,
                    "factor_labels": {},
                },
                "top_clients": [],
                "materiality_alerts": [],
                "clave_insights": {"top_claves": [], "high_risk_claves": []},
            }
        return analyzer.get_risk_diagnostic()

    # ========== AUDIT & RISK METHODS (Module 4) ==========



    def get_efos_risks(self):
        """Returns invoices where client/provider is flagged in EFOS list"""
        try:
            # Check ESTATUS PROOVEDORES column for EFOS warnings
            efos_flagged = self.df_facturas[
                (self.df_facturas['ESTATUS PROOVEDORES'].notna()) & 
                (self.df_facturas['ESTATUS PROOVEDORES'] != 'Sin lista EFOS') &
                (self.df_facturas['ESTATUS PROOVEDORES'].str.len() > 3)
            ].copy()
            
            cols = ['UUID', 'FOLIO', 'FECHA', 'EMPRESA', 'CLIENTE', 'TOTAL NETO', 'ESTATUS PROOVEDORES']
            result = efos_flagged[cols].copy() if not efos_flagged.empty else pd.DataFrame(columns=cols)
            result['FECHA'] = result['FECHA'].astype(str)
            
            return {
                "count": len(result),
                "total_amount": result['TOTAL NETO'].sum() if not result.empty else 0,
                "records": result.head(100).to_dict(orient='records')
            }
        except Exception as e:
            print(f"Error getting EFOS risks: {e}")
            return {"count": 0, "total_amount": 0, "records": []}

    def get_ppd_discrepancies(self):
        """Returns PPD invoices without payment complement after day 17 of following month"""
        try:
            now = datetime.now()
            
            # PPD invoices that should have complement
            # Exclude invoices whose UUID appears in the Canceladas sheet
            cancelled_uuids = set()
            if hasattr(self, 'df_canceladas') and not self.df_canceladas.empty and 'UUID' in self.df_canceladas.columns:
                cancelled_uuids = set(self.df_canceladas['UUID'].dropna().astype(str))

            ppd_mask = (self.df_facturas['METODO PAGO'] == 'PPD')
            if 'COMPLEMENTO' in self.df_facturas.columns:
                ppd_mask = ppd_mask & (self.df_facturas['COMPLEMENTO'] == 'NO')
            if cancelled_uuids:
                ppd_mask = ppd_mask & (~self.df_facturas['UUID'].astype(str).isin(cancelled_uuids))

            ppd = self.df_facturas[ppd_mask].copy()
            
            # Calculate if past day 17 of following month
            def is_overdue(fecha):
                if pd.isna(fecha):
                    return False
                # Day 17 of next month
                if fecha.month == 12:
                    deadline = datetime(fecha.year + 1, 1, 17)
                else:
                    deadline = datetime(fecha.year, fecha.month + 1, 17)
                return now > deadline
            
            ppd['overdue'] = ppd['FECHA'].apply(is_overdue)
            overdue_ppd = ppd[ppd['overdue'] == True]
            
            cols = ['UUID', 'FOLIO', 'FECHA', 'EMPRESA', 'CLIENTE', 'TOTAL NETO', 'SALDO PENDIENTE']
            result = overdue_ppd[cols].copy() if not overdue_ppd.empty else pd.DataFrame(columns=cols)
            result['FECHA'] = result['FECHA'].astype(str)
            
            return {
                "count": len(result),
                "total_amount": result['TOTAL NETO'].sum() if not result.empty else 0,
                "pending_amount": result['SALDO PENDIENTE'].sum() if not result.empty else 0,
                "records": result.head(100).to_dict(orient='records')
            }
        except Exception as e:
            print(f"Error getting PPD discrepancies: {e}")
            return {"count": 0, "total_amount": 0, "pending_amount": 0, "records": []}

    # ========== TEMPORAL ANALYSIS METHODS (Module 5) ==========

    def get_year_comparison(self, empresa=None, start_date=None, end_date=None):
        """Returns year-over-year comparison data (2024 vs 2025 vs 2026)"""
        try:
            df = self.apply_filters(self.df_facturas, empresa, None, start_date, end_date).copy()
            df['Year'] = df['FECHA'].dt.year
            df['Month'] = df['FECHA'].dt.month
            
            # Group by year and month
            monthly = df.groupby(['Year', 'Month'])['TOTAL NETO'].sum().reset_index()
            
            # Pivot to have years as columns
            years_data = {}
            for year in [2024, 2025, 2026]:
                year_df = monthly[monthly['Year'] == year]
                years_data[str(year)] = {row['Month']: row['TOTAL NETO'] for _, row in year_df.iterrows()}
            
            # Format for chart
            months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
            result = []
            for i, month_name in enumerate(months, 1):
                result.append({
                    "month": month_name,
                    "2024": years_data.get("2024", {}).get(i, 0),
                    "2025": years_data.get("2025", {}).get(i, 0),
                    "2026": years_data.get("2026", {}).get(i, 0)
                })
            
            # Calculate yearly totals
            totals = df.groupby('Year')['TOTAL NETO'].sum().to_dict()
            
            return {
                "monthly_data": result,
                "yearly_totals": {str(k): v for k, v in totals.items()}
            }
        except Exception as e:
            print(f"Error getting year comparison: {e}")
            return {"monthly_data": [], "yearly_totals": {}}

    def get_company_monthly_trend(self, top_n=5):
        """Returns monthly billing trend for top N companies"""
        try:
            df = self.df_facturas.copy()
            
            # Get top companies by total billing
            top_companies = df.groupby('EMPRESA')['TOTAL NETO'].sum().nlargest(top_n).index.tolist()
            
            df_top = df[df['EMPRESA'].isin(top_companies)]
            df_top['MonthYear'] = df_top['FECHA'].dt.to_period('M').astype(str)
            
            # Pivot data
            pivot = df_top.groupby(['MonthYear', 'EMPRESA'])['TOTAL NETO'].sum().unstack(fill_value=0)
            
            result = []
            for month in pivot.index:
                row = {"month": month}
                for company in top_companies:
                    row[company] = pivot.loc[month, company] if company in pivot.columns else 0
                result.append(row)
            
            return {
                "companies": top_companies,
                "data": result[-12:]  # Last 12 months
            }
        except Exception as e:
            print(f"Error getting company monthly trend: {e}")
            return {"companies": [], "data": []}

    def get_collection_days_trend(self):
        """Returns average collection days trend by month (days from invoice to actual payment)"""
        try:
            if self.df_complementos.empty:
                return []

            # Join invoices with their payment complements to get actual payment dates
            df_fac = self.df_facturas[['UUID', 'FECHA', 'CLIENTE']].copy()
            df_comp = self.df_complementos[['UUID FACTURA RELACIONADA', 'FECHA PAGO']].copy()
            df_comp = df_comp.rename(columns={'UUID FACTURA RELACIONADA': 'UUID'})

            merged = pd.merge(df_fac, df_comp, on='UUID', how='inner')
            merged['FECHA'] = pd.to_datetime(merged['FECHA'], errors='coerce')
            merged['FECHA PAGO'] = pd.to_datetime(merged['FECHA PAGO'], errors='coerce')
            merged = merged.dropna(subset=['FECHA', 'FECHA PAGO'])

            merged['DaysToCollect'] = (merged['FECHA PAGO'] - merged['FECHA']).dt.days
            # Filter out negative or implausibly large values
            merged = merged[(merged['DaysToCollect'] >= 0) & (merged['DaysToCollect'] <= 730)]

            if merged.empty:
                return []

            merged['MonthYear'] = merged['FECHA'].dt.to_period('M').astype(str)

            trend = merged.groupby('MonthYear')['DaysToCollect'].mean().reset_index()
            trend.columns = ['month', 'avg_days']
            trend['avg_days'] = trend['avg_days'].round(0)

            return trend.tail(12).to_dict(orient='records')
        except Exception as e:
            print(f"Error getting collection days trend: {e}")
            return []

    def get_pareto_clients(self, empresa=None, start_date=None, end_date=None):
        """Returns the Pareto distribution of clients (80/20 rule)"""
        try:
            df = self.apply_filters(self.df_facturas, empresa, None, start_date, end_date)
            if df.empty:
                return []
                
            # Group by client and sum, sort descending
            pareto = df.groupby('CLIENTE')['TOTAL NETO'].sum().reset_index()
            pareto = pareto[pareto['TOTAL NETO'] > 0] # Filter out returns or 0
            pareto = pareto.sort_values(by='TOTAL NETO', ascending=False).reset_index(drop=True)
            
            # Cumulative calculations
            total_revenue = pareto['TOTAL NETO'].sum() or 1
            pareto['acumulado'] = pareto['TOTAL NETO'].cumsum()
            pareto['pct_ingreso'] = (pareto['TOTAL NETO'] / total_revenue) * 100
            pareto['pct_acumulado'] = (pareto['acumulado'] / total_revenue) * 100
            
            # Limit to top clients or when it reaches ~95% to avoid sending thousands of tiny rows to frontend
            # Or just send the top 50, which usually covers the 80%
            pareto = pareto.head(50)
            
            result = []
            for idx, row in pareto.iterrows():
                result.append({
                    "cliente": row['CLIENTE'],
                    "monto": float(row['TOTAL NETO']),
                    "pct_acumulado": round(float(row['pct_acumulado']), 1),
                    "pct_individual": round(float(row['pct_ingreso']), 1)
                })
            
            return result
        except Exception as e:
            print(f"Error calculating Pareto distribution: {e}")
            return []


    def get_ppd_pue_ratio(self, empresa=None, start_date=None, end_date=None):
        """Returns the volume (count) and amount of PPD vs PUE invoices"""
        try:
            df = self.apply_filters(self.df_facturas, empresa, None, start_date, end_date)
            if df.empty:
                return []
            
            summary = df.groupby('METODO PAGO').agg({
                'UUID': 'count',
                'TOTAL NETO': 'sum'
            }).reset_index()
            
            result = []
            for _, row in summary.iterrows():
                metodo = str(row['METODO PAGO']).strip()
                if not metodo or metodo.lower() == 'nan':
                    continue
                result.append({
                    "metodo": metodo,
                    "cantidad": int(row['UUID']),
                    "monto": float(row['TOTAL NETO'])
                })
            
            return result
        except Exception as e:
            print(f"Error calculating PPD/PUE ratio: {e}")
            return []
            
    def get_geographic_sales(self, empresa=None, start_date=None, end_date=None):
        """Returns sales aggregated by Mexican State based on CP RECEPTOR."""
        try:
            df = self.apply_filters(self.df_facturas, empresa, None, start_date, end_date)
            if df.empty or 'CP RECEPTOR' not in df.columns:
                return []
                
            # Filter rows that actually have a zip code and total net
            df_geo = df.dropna(subset=['CP RECEPTOR', 'TOTAL NETO']).copy()
            if df_geo.empty:
                return []
                
            def get_state(cp):
                try:
                    cp_int = int(str(cp).strip()[:5])  # Take first 5 chars in case of zip+4
                    for start, end, state in ESTADOS_CP_RANGES:
                        if start <= cp_int <= end:
                            return state
                    return "Desconocido"
                except:
                    return "Desconocido"
            
            df_geo['Estado'] = df_geo['CP RECEPTOR'].apply(get_state)
            
            # Group by state
            grouped = df_geo.groupby('Estado').agg({
                'TOTAL NETO': 'sum',
                'UUID': 'count'
            }).reset_index()
            
            # Calculate percentages
            total_sales = grouped['TOTAL NETO'].sum() or 1
            grouped['Porcentaje'] = (grouped['TOTAL NETO'] / total_sales) * 100
            
            # Sort by total net
            grouped = grouped.sort_values('TOTAL NETO', ascending=False)
            
            result = []
            for _, row in grouped.iterrows():
                if row['Estado'] == "Desconocido":
                    continue # Skip unknowns to keep the map clean
                result.append({
                    "estado": row['Estado'],
                    "monto": float(row['TOTAL NETO']),
                    "facturas": int(row['UUID']),
                    "porcentaje": round(float(row['Porcentaje']), 2)
                })
                
            return result
        except Exception as e:
            print(f"Error processing geographic data: {e}")
            return []

    def get_geographic_sales_by_state(self, target_state, empresa=None, start_date=None, end_date=None):
        """Returns top zip codes (colonias) for a specific Mexican State based on CP RECEPTOR."""
        try:
            df = self.apply_filters(self.df_facturas, empresa, None, start_date, end_date)
            if df.empty or 'CP RECEPTOR' not in df.columns:
                return []
                
            # Filter rows that actually have a zip code and total net
            df_geo = df.dropna(subset=['CP RECEPTOR', 'TOTAL NETO']).copy()
            if df_geo.empty:
                return []
                
            def get_state(cp):
                try:
                    cp_int = int(str(cp).strip()[:5])
                    for start, end, state in ESTADOS_CP_RANGES:
                        if start <= cp_int <= end:
                            return state
                    return "Desconocido"
                except:
                    return "Desconocido"
            
            df_geo['Estado'] = df_geo['CP RECEPTOR'].apply(get_state)
            
            # Helper for normalize comparison
            import unicodedata
            def normalize(s):
                if not isinstance(s, str): return ""
                return ''.join(c for c in unicodedata.normalize('NFD', s)
                               if unicodedata.category(c) != 'Mn').lower()
                               
            target_normalized = normalize(target_state)
            if target_normalized in ["distrito federal", "cdmx", "ciudad de mexico"]:
                target_normalized = "ciudad de mexico" # Normalize targeting
                
            # Filter by exactly the target state
            def match_state(s):
                s_norm = normalize(s)
                if s_norm in ["distrito federal", "cdmx", "ciudad de mexico"]:
                    s_norm = "ciudad de mexico"
                return s_norm == target_normalized or target_normalized.replace(" ", "") in s_norm.replace(" ", "")

            df_geo = df_geo[df_geo['Estado'].apply(match_state)]
            
            if df_geo.empty:
                return []
            
            # Group by CP
            grouped = df_geo.groupby('CP RECEPTOR').agg({
                'TOTAL NETO': 'sum',
                'UUID': 'count'
            }).reset_index()
            
            total_sales = grouped['TOTAL NETO'].sum() or 1
            grouped['Porcentaje'] = (grouped['TOTAL NETO'] / total_sales) * 100
            grouped = grouped.sort_values('TOTAL NETO', ascending=False).head(20) # Top 20 zip codes
            
            result = []
            for _, row in grouped.iterrows():
                result.append({
                    "cp": str(row['CP RECEPTOR']).strip(),
                    "monto": float(row['TOTAL NETO']),
                    "facturas": int(row['UUID']),
                    "porcentaje": round(float(row['Porcentaje']), 2)
                })
                
            return result
        except Exception as e:
            print(f"Error processing CP drill-down data: {e}")
            return []

    def get_ppd_lifecycle(self, empresa=None, start_date=None, end_date=None):
        """Analyzes the time it takes to pay PPD invoices and identifies clients with the most delay"""
        try:
            df_fac = self.apply_filters(self.df_facturas, empresa, None, start_date, end_date)
            
            # We ONLY care about PPD invoices
            df_fac = df_fac[df_fac['METODO PAGO'].astype(str).str.upper().str.contains('PPD', na=False)]
            
            if df_fac.empty or self.df_complementos.empty:
                return {"promedio_dias_general": 0, "top_rezago": [], "top_velocidad": []}
                
            # Merge with complements to get payment dates
            # Complements have 'UUID FACTURA RELACIONADA' and 'FECHA PAGO'
            comp_df = self.df_complementos.copy()
            
            # The relationship is usually UUID -> UUID FACTURA RELACIONADA
            merged = pd.merge(
                df_fac[['UUID', 'CLIENTE', 'FECHA', 'TOTAL NETO']],
                comp_df[['UUID FACTURA RELACIONADA', 'FECHA PAGO']],
                left_on='UUID',
                right_on='UUID FACTURA RELACIONADA',
                how='inner' # Only invoices with AT LEAST one payment
            )
            
            if merged.empty:
                 return {"promedio_dias_general": 0, "top_rezago": [], "top_velocidad": []}
            
            # Ensure datetime
            merged['FECHA'] = pd.to_datetime(merged['FECHA'], errors='coerce')
            merged['FECHA PAGO'] = pd.to_datetime(merged['FECHA PAGO'], errors='coerce')
            
            # Calculate delta days
            merged['dias_retraso'] = (merged['FECHA PAGO'] - merged['FECHA']).dt.days
            merged = merged[merged['dias_retraso'] >= 0] # Filter out weird negative dates if any
            
            if merged.empty:
                 return {"promedio_dias_general": 0, "top_rezago": [], "top_velocidad": []}
                 
            # 1. Global Average Days to pay PPD
            avg_global = float(merged['dias_retraso'].mean())
            
            # 2. Top 10 clients with the highest average delay
            client_delay = merged.groupby('CLIENTE').agg({
                'dias_retraso': 'mean',
                'UUID': 'nunique', # Number of paid invoices
                'TOTAL NETO': 'sum' # It's technically the sum of invoice totals for those payments, okay for a rough metric
            }).reset_index()
            
            # Filter out clients with only 1 invoice to improve statistical significance
            client_delay = client_delay[client_delay['UUID'] > 1]
            
            # Top Peores (Slowest)
            worst_delay = client_delay.sort_values(by='dias_retraso', ascending=False).head(5)
            
            top_rezago = []
            for _, row in worst_delay.iterrows():
                top_rezago.append({
                    "cliente": row['CLIENTE'],
                    "dias_promedio": round(float(row['dias_retraso']), 1),
                    "facturas_pagadas": int(row['UUID'])
                })
                
            # Top Mejores (Fastest)
            best_delay = client_delay.sort_values(by='dias_retraso', ascending=True).head(5)
            
            top_velocidad = []
            for _, row in best_delay.iterrows():
                top_velocidad.append({
                    "cliente": row['CLIENTE'],
                    "dias_promedio": round(float(row['dias_retraso']), 1),
                    "facturas_pagadas": int(row['UUID'])
                })
                
            return {
                "promedio_dias_general": round(avg_global, 1),
                "top_rezago": top_rezago,
                "top_velocidad": top_velocidad
            }
        except Exception as e:
            print(f"Error calculating PPD lifecycle: {e}")
            return {"promedio_dias_general": 0, "top_rezago": [], "top_velocidad": []}

    def get_seasonality_analysis(self):
        """Returns seasonality patterns for billing based on CFDI count (volume of operations)"""
        try:
            df = self.df_facturas.copy()
            if df.empty:
                return []
                
            # Create Period for grouping
            df['Period'] = df['FECHA'].dt.to_period('M')
            
            # Group by Period (Month-Year) and count UUIDs (Volume of invoices)
            monthly_counts = df.groupby('Period')['UUID'].count().reset_index()
            monthly_counts.columns = ['Period', 'Count']
            
            # Calculate global average of invoices per month
            overall_avg = monthly_counts['Count'].mean()
            
            result = []
            # Iterate through chronological periods
            for _, row in monthly_counts.iterrows():
                # Format period as "Mmm YY" (e.g. "Ene 24")
                # Spanish mapping could be enhanced, simplified here
                period_str = str(row['Period']) # YYYY-MM
                date_obj = row['Period'].start_time
                months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
                month_name = months[date_obj.month - 1]
                year_short = str(date_obj.year)[-2:]
                label = f"{month_name} {year_short}"
                
                count = row['Count']
                # Calculate index: (Monthly Count / Average) * 100
                index = (count / overall_avg * 100) if overall_avg > 0 else 100
                
                result.append({
                    "month": label,
                    "year": int(date_obj.year),
                    "count": int(count),
                    "seasonality_index": round(index, 1)
                })
            
            return result
        except Exception as e:
            print(f"Error getting seasonality: {e}")
            return []

    # ========== COMPANY VIEW METHODS (Module 6) ==========

    def get_companies_summary(self, empresa=None, start_date=None, end_date=None):
        """Returns summary stats for all companies"""
        try:
            df = self.apply_filters(self.df_facturas, empresa, None, start_date, end_date).copy()
            now = datetime.now()
            
            df['FECHA'] = pd.to_datetime(df['FECHA'], errors='coerce')
            df['DaysOpen'] = (now - df['FECHA']).dt.days.clip(lower=0)
            
            summary = df.groupby('EMPRESA').agg({
                'TOTAL NETO': 'sum',
                'SALDO PENDIENTE': 'sum',
                'UUID': 'count',
                'CLIENTE': 'nunique',
                'DaysOpen': 'mean'
            }).reset_index()
            
            summary.columns = ['empresa', 'total_ventas', 'saldo_pendiente', 'total_facturas', 'num_clientes', 'dias_promedio']
            summary = summary.sort_values('total_ventas', ascending=False)
            
            return summary.to_dict(orient='records')
        except Exception as e:
            print(f"Error getting companies summary: {e}")
            return []

    def get_company_stats(self, empresa: str, start_date=None, end_date=None):
        """Returns detailed stats for a specific company"""
        try:
            df = self.apply_filters(self.df_facturas, empresa, None, start_date, end_date).copy()
            
            if df.empty:
                return None
            
            # KPIs
            total_facturado = df['TOTAL NETO'].sum()
            saldo_pendiente = df['SALDO PENDIENTE'].sum()
            num_facturas = len(df)
            num_clientes = df['CLIENTE'].nunique()
            
            # Top clients for this company
            top_clients = df.groupby('CLIENTE').agg({
                'TOTAL NETO': 'sum',
                'SALDO PENDIENTE': 'sum',
                'UUID': 'count'
            }).reset_index()
            top_clients.columns = ['cliente', 'total', 'saldo', 'facturas']
            top_clients = top_clients.sort_values('total', ascending=False).head(10)
            
            # Monthly trend for this company
            df['MonthYear'] = df['FECHA'].dt.to_period('M').astype(str)
            monthly = df.groupby('MonthYear')['TOTAL NETO'].sum().reset_index()
            monthly.columns = ['month', 'total']
            monthly = monthly.tail(12)
            
            # Payment status distribution
            status_dist = df['ESTATUS DE COBRO'].value_counts().to_dict()
            
            return {
                "empresa": empresa,
                "kpis": {
                    "total_facturado": total_facturado,
                    "saldo_pendiente": saldo_pendiente,
                    "num_facturas": num_facturas,
                    "num_clientes": num_clientes,
                    "porcentaje_pendiente": round((saldo_pendiente / total_facturado * 100) if total_facturado > 0 else 0, 1)
                },
                "top_clientes": top_clients.to_dict(orient='records'),
                "monthly_trend": monthly.to_dict(orient='records'),
                "status_distribution": status_dist
            }
        except Exception as e:
            print(f"Error getting company stats: {e}")
            return None

    def get_filters_data(self, lens=None, empresa=None, cliente=None):
        """Returns lists for sidebar filters, scoped to the active context"""
        if self.df_facturas.empty:
            return {
                "empresas": [],
                "clientes": []
            }

        df = self.df_facturas.copy()
        
        # Scope by empresa (emisor) or cliente (receptor)
        if empresa and empresa.strip():
            df = df[df['EMPRESA'] == empresa]
        if cliente and cliente.strip():
            df = df[df['CLIENTE'].str.contains(cliente, case=False, na=False)]

        if lens == 'debt':
            if 'METODO PAGO' in df.columns:
                df = df[df['METODO PAGO'] == 'PPD'].copy()
            df = df[df['SALDO PENDIENTE'] > 1].copy()
        elif lens == 'intangibles' and hasattr(self, 'df_conceptos') and not self.df_conceptos.empty:
            intangibles_conceptos = self.df_conceptos[self.df_conceptos['CLAVE PROD/SERV'].astype(str).str.startswith(('80', '81', '82', '83', '84', '85'))]
            if not intangibles_conceptos.empty:
                intangibles_uuids = intangibles_conceptos['UUID'].unique()
                df = df[df['UUID'].isin(intangibles_uuids)].copy()
            else:
                df = df.iloc[0:0]

        conceptos_list = []
        if hasattr(self, 'df_conceptos') and not self.df_conceptos.empty and not df.empty:
            desc_col = 'DESCRIPCION SAT' if 'DESCRIPCION SAT' in self.df_conceptos.columns else ('DESCRIPCION' if 'DESCRIPCION' in self.df_conceptos.columns else None)
            if desc_col:
                uuids_vigentes = df['UUID'].unique()
                conceptos_vigentes = self.df_conceptos[self.df_conceptos['UUID'].isin(uuids_vigentes)]
                conceptos_list = sorted(conceptos_vigentes[desc_col].dropna().astype(str).unique().tolist())

        return {
            "empresas": sorted(df['EMPRESA'].astype(str).unique().tolist()) if not df.empty else [],
            "clientes": sorted(df['CLIENTE'].astype(str).unique().tolist()) if not df.empty else [],
            "conceptos": conceptos_list
        }



    def get_aging_report(self, empresa=None, start_date=None, end_date=None):
        df = self.apply_filters(self.df_facturas, empresa, None, start_date, end_date)
        report = AgingReport(df)
        return {"buckets": report.build()}

    def get_anomalies(self):
        detector = self._get_anomaly_detector()
        return detector.run_all()

    def get_company_risk_score(self, empresa: str):
        analyzer = self._get_risk_analyzer()
        if not analyzer:
            return None
        df = self.df_facturas[self.df_facturas['EMPRESA'] == empresa]
        if df.empty:
            return None
        clientes = df['CLIENTE'].unique()
        breakdown = []
        for cliente in clientes:
            result = analyzer._calculate_metrics_for_client(cliente)
            if result:
                breakdown.append(result.to_dict())
        avg_score = np.mean([item['risk_score'] for item in breakdown]) if breakdown else 0
        return {
            'empresa': empresa,
            'score': round(avg_score, 1),
            'clientes': breakdown,
        }

    # ========== INVOICE DETAIL & DRILL DOWN ==========

    def get_invoice_detail(self, identifier: str):
        """Returns full detail of a specific invoice including items and payments.
        
        Args:
            identifier: UUID of the invoice (preferred) or FOLIO as fallback.
        """
        if self.df_facturas.empty:
            return None
            
        # 1. Find the Invoice — prefer UUID (unique) over FOLIO (duplicated across companies)
        search = str(identifier).strip()
        
        # Try UUID first (exact match, unique)
        invoice = self.df_facturas[self.df_facturas['UUID'].astype(str).str.strip() == search]
        
        if invoice.empty:
            # Fallback: search by FOLIO (may return multiple rows from different companies)
            invoice = self.df_facturas[self.df_facturas['FOLIO'].astype(str).str.strip() == search]
            
        if invoice.empty:
            return None
            
        inv_data = invoice.iloc[0].to_dict()
        uuid = str(inv_data.get('UUID', '')).strip()
        
        # Clean up timestamps for JSON
        for k, v in inv_data.items():
            if isinstance(v, (pd.Timestamp, datetime)):
                inv_data[k] = v.isoformat()
            if pd.isna(v):
                inv_data[k] = None

        # 2. Find Concepts (Items) — linked by UUID
        concepts = []
        if not self.df_conceptos.empty and uuid:
            if 'UUID' in self.df_conceptos.columns:
                inv_concepts = self.df_conceptos[
                    self.df_conceptos['UUID'].astype(str).str.strip() == uuid
                ].copy()
                inv_concepts = inv_concepts.fillna('')
                concepts = inv_concepts.to_dict(orient='records')

        # 3. Find Payments (Complementos) — linked by 'UUID FACTURA RELACIONADA'
        payments = []
        if not self.df_complementos.empty and uuid:
            uuid_norm = uuid.strip().upper()
            
            # Primary: match on 'UUID FACTURA RELACIONADA' (correct column)
            if 'UUID FACTURA RELACIONADA' in self.df_complementos.columns:
                pay_mask = self.df_complementos['UUID FACTURA RELACIONADA'].astype(str).str.strip().str.upper() == uuid_norm
                inv_payments = self.df_complementos[pay_mask].copy()
            else:
                inv_payments = pd.DataFrame()
            
            # Fallback: if nothing found, try 'FOLIO RELACIONADO' as last resort
            if inv_payments.empty and 'FOLIO RELACIONADO' in self.df_complementos.columns:
                folio = str(inv_data.get('FOLIO', '')).strip()
                if folio:
                    pay_mask = self.df_complementos['FOLIO RELACIONADO'].astype(str).str.strip() == folio
                    inv_payments = self.df_complementos[pay_mask].copy()
            
            if not inv_payments.empty:
                if 'FECHA PAGO' in inv_payments.columns:
                    inv_payments['FECHA PAGO'] = inv_payments['FECHA PAGO'].astype(str)
                inv_payments = inv_payments.fillna('')
                payments = inv_payments.to_dict(orient='records')

        # 4. Recalculate saldo based on actual payments found
        total_neto = float(inv_data.get('TOTAL NETO', 0) or 0)
        notas_credito = float(inv_data.get('NOTAS DE CREDITO', 0) or 0)
        metodo_pago = str(inv_data.get('METODO PAGO', '')).strip().upper()
        
        if metodo_pago == 'PUE':
            total_pagado_real = total_neto
            saldo_calculado = 0
        else:
            total_pagado_real = sum(float(p.get('IMPORTE PAGADO', 0) or 0) for p in payments)
            saldo_calculado = max(0, total_neto - total_pagado_real - notas_credito)
        
        # Add calculated fields for frontend consistency
        inv_data['_TOTAL_PAGADO_REAL'] = round(total_pagado_real, 2)
        inv_data['_SALDO_CALCULADO'] = round(saldo_calculado, 2)
        inv_data['_NUM_PAGOS'] = len(payments)

        return {
            "invoice": inv_data,
            "concepts": concepts,
            "payments": payments
        }

    def get_invoices_table(
        self,
        page: int = 1,
        limit: int = 50,
        empresa: str | None = None,
        cliente: str | None = None,
        concepto: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        status: str | None = None,
        folio: str | None = None,
        lens: str | None = None,
        sort_by: str | None = None,
        sort_dir: str = 'desc',
        aging_status: str | None = None,
    ):
        """Returns paginated invoices list with full filtering.
        
        status: puede ser un valor único ('PENDIENTE') o múltiples separados por
                coma ('PENDIENTE,PARCIAL'). El token 'ALL' desactiva el filtro.
        sort_dir: 'asc' (más antiguo primero) o 'desc' (más reciente primero).
        """
        base_meta = {
            "page": max(1, page),
            "limit": max(1, limit),
            "total_records": 0,
            "total_pages": 0,
            "aggregates": {"total_neto": 0.0, "total_saldo": 0.0},
        }

        if self.df_facturas.empty:
            return {"data": [], "meta": base_meta}

        # apply_filters maneja un único status; lo quitamos del llamado
        # para gestionar multi-status manualmente aquí.
        df = self.apply_filters(self.df_facturas, empresa, cliente, start_date, end_date, None, folio)

        # ── Filtro multi-estatus ────────────────────────────────────────────
        if status and str(status).strip() and str(status).strip().upper() != 'ALL':
            status_list = [s.strip().upper() for s in str(status).split(',') if s.strip()]
            if status_list:
                if 'ESTATUS DE COBRO' in df.columns:
                    # Normalizar columna: forzar str, quitar espacios y pasar a mayuscúlas
                    col_norm = df['ESTATUS DE COBRO'].astype(str).str.strip().str.upper()
                    print(f"[STATUS FILTER] buscando {status_list} en columa. Valores únicos: {col_norm.unique()[:10].tolist()}")
                    df = df[col_norm.isin(status_list)].copy()
                    print(f"[STATUS FILTER] resultado: {len(df)} filas")
                else:
                    print(f"[STATUS FILTER] columna 'ESTATUS DE COBRO' NO encontrada. Columnas: {df.columns.tolist()[:10]}")
        # ─────────────────────────────────────────────────────────────────────

        # ── Filtro por concepto ──────────────────────────────────────────────
        if concepto and concepto.strip() and hasattr(self, 'df_conceptos') and not self.df_conceptos.empty:
            desc_col = 'DESCRIPCION SAT' if 'DESCRIPCION SAT' in self.df_conceptos.columns else ('DESCRIPCION' if 'DESCRIPCION' in self.df_conceptos.columns else None)
            if desc_col:
                conceptos_filtered = self.df_conceptos[self.df_conceptos[desc_col].astype(str) == concepto.strip()]
                if not conceptos_filtered.empty:
                    uuids_filtered = conceptos_filtered['UUID'].unique()
                    df = df[df['UUID'].isin(uuids_filtered)].copy()
                else:
                    df = df.iloc[0:0]
        # ─────────────────────────────────────────────────────────────────────

        if lens == 'debt':
            if 'METODO PAGO' in df.columns:
                df = df[df['METODO PAGO'] == 'PPD'].copy()
            df = df[df['SALDO PENDIENTE'] > 1].copy()
        elif lens == 'intangibles' and hasattr(self, 'df_conceptos') and not self.df_conceptos.empty:
            intangibles_conceptos = self.df_conceptos[self.df_conceptos['CLAVE PROD/SERV'].astype(str).str.startswith(('80', '81', '82', '83', '84', '85'))]
            if intangibles_conceptos.empty:
                df = df.iloc[0:0]
            else:
                intangibles_uuids = intangibles_conceptos['UUID'].unique()
                df = df[df['UUID'].isin(intangibles_uuids)].copy()

        # ── Aging Status Filter ──────────────────────────────────────────────
        if aging_status and aging_status.strip().upper() != 'ALL' and not df.empty and 'FECHA' in df.columns:
            now_dt = pd.Timestamp.now().normalize()
            fechas_dt = pd.to_datetime(df['FECHA'], errors='coerce').dt.normalize()
            diff_days = (now_dt - fechas_dt).dt.days.abs()
            
            aging_val = aging_status.strip().upper()
            if aging_val == 'CRITICO':
                df = df[diff_days >= 30].copy()
            elif aging_val == 'PREVENTIVO':
                df = df[(diff_days >= 8) & (diff_days < 30)].copy()
            elif aging_val == 'NORMAL':
                df = df[diff_days < 8].copy()

        if df.empty:
            return {"data": [], "meta": base_meta}

        # ── Ordenamiento por fecha ────────────────────────────────────────────
        ascending = (sort_dir.strip().lower() == 'asc')
        print(f"[SORT] sort_dir='{sort_dir}' → ascending={ascending}. Total rows antes del sort: {len(df)}")

        # Asegurar que FECHA sea datetime (puede haber quedado como string si venía del cache)
        if 'FECHA' in df.columns and df['FECHA'].dtype == object:
            df = df.copy()
            df['FECHA'] = pd.to_datetime(df['FECHA'], errors='coerce')

        sort_cols = []
        sort_asc = []

        if sort_by:
            actual_col = sort_by.upper()
            if actual_col in df.columns:
                sort_cols.append(actual_col)
                sort_asc.append(ascending)

        # Fallback a FECHA si no se ordenó o como desempate
        if 'FECHA' not in sort_cols:
            sort_cols.append('FECHA')
            # Si se usó una columna distinta para ordenar, como Monto, el default para fecha debería ser el mismo que sortDir para consistencia, o siempre desc.
            sort_asc.append(ascending if not sort_by else False) 

        # Desempate final por FOLIO para orden estable entre páginas
        if 'FOLIO' in df.columns:
            sort_cols.append('FOLIO')
            sort_asc.append(not ascending)  # mismo sentido que fecha para consistencia
            
        df = df.sort_values(sort_cols, ascending=sort_asc, na_position='last').reset_index(drop=True)

        # Log primeras 3 fechas para confirmar que el sort funcionó
        if len(df) > 0:
            primeras = df['FECHA'].head(3).astype(str).tolist()
            print(f"[SORT] Primeras 3 fechas ({sort_dir}): {primeras}")
        # ─────────────────────────────────────────────────────────────────────

        total_records = len(df)
        total_neto = float(df['TOTAL NETO'].sum())
        total_saldo = float(df['SALDO PENDIENTE'].sum())
        
        limit = max(10, min(limit, 500))
        page = max(1, page)
        total_pages = ceil(total_records / limit) if total_records else 0
        page = min(page, total_pages if total_pages > 0 else 1)
        
        start = (page - 1) * limit
        end = start + limit
        
        page_df = df.iloc[start:end].copy()
        
        # Format for JSON
        page_df['FECHA'] = page_df['FECHA'].astype(str)
        
        # MATERIALIDAD: pendiente de conectar con módulo real
        # (seguimiento legal / materialidad)
        # ------------------------------------
        
        # Fill NaNs
        page_df = page_df.fillna('')
        
        # ── Dashboard Aging KPIs ──────────────────────────────────────────────
        critico_count = 0
        preventivo_count = 0
        normal_count = 0
        saldo_critico = 0.0

        if not df.empty and 'FECHA' in df.columns:
            now_dt = pd.Timestamp.now().normalize()
            fechas_dt = pd.to_datetime(df['FECHA'], errors='coerce').dt.normalize()
            diff_days = (now_dt - fechas_dt).dt.days.abs()
            
            critico_mask = diff_days >= 30
            preventivo_mask = (diff_days >= 8) & (diff_days < 30)
            normal_mask = diff_days < 8
            
            critico_count = int(critico_mask.sum())
            preventivo_count = int(preventivo_mask.sum())
            normal_count = int(normal_mask.sum())
            
            if 'SALDO PENDIENTE' in df.columns:
                saldo_critico = float(pd.to_numeric(df.loc[critico_mask, 'SALDO PENDIENTE'], errors='coerce').fillna(0).sum())
        
        meta = {
            "page": page,
            "limit": limit,
            "total_records": total_records,
            "total_pages": total_pages,
            "aggregates": {
                "total_neto": total_neto,
                "total_saldo": total_saldo,
                "kpis": {
                    "critico": critico_count,
                    "preventivo": preventivo_count,
                    "normal": normal_count,
                    "saldo_critico": saldo_critico
                }
            },
        }
        
        return {"data": page_df.to_dict(orient='records'), "meta": meta}

    def get_carrusel_risk(self, empresa=None, start_date=None, end_date=None):
        """Detects carousel billing where an issuer is also a client of another firm in the portfolio."""
        if self.df_facturas.empty:
            return []
            
        df = self.apply_filters(self.df_facturas, None, None, start_date, end_date)
        if df.empty:
            return []
            
        # Cancelled filtered
        if 'ESTATUS DE COBRO' in df.columns:
            df = df[df['ESTATUS DE COBRO'] != 'Cancelado'].copy()
            
        # Filter by requested empresa if any
        df_emisor = df[df['EMPRESA'] == empresa] if empresa else df
            
        empresas_set = set(df_emisor['EMPRESA'].unique())
        clientes_set = set(df['CLIENTE'].unique())
        cruzados = empresas_set.intersection(clientes_set)
        
        results = []
        if cruzados:
            cruzados_list = list(cruzados)
            # Compute totals once
            emite_totals = df[df['EMPRESA'].isin(cruzados_list)].groupby('EMPRESA')['TOTAL NETO'].sum().to_dict()
            recibe_totals = df[df['CLIENTE'].isin(cruzados_list)].groupby('CLIENTE')['TOTAL NETO'].sum().to_dict()
            
            # Compute providers once
            prov_df = df[df['CLIENTE'].isin(cruzados_list)].groupby(['CLIENTE', 'EMPRESA'])['TOTAL NETO'].sum().reset_index()
            
            # Group providers by cliente
            prov_dict = {}
            for row in prov_df.to_dict('records'):
                c = row['CLIENTE']
                if c not in prov_dict:
                    prov_dict[c] = []
                prov_dict[c].append({"empresa": row['EMPRESA'], "monto": float(row['TOTAL NETO'])})
            
            for c in sorted(cruzados):
                emite = float(emite_totals.get(c, 0))
                recibe = float(recibe_totals.get(c, 0))
                if emite == 0 or recibe == 0:
                    continue
                ratio = emite / recibe if recibe > 0 else float('inf')
                
                prov_list = prov_dict.get(c, [])
                prov_list.sort(key=lambda x: x['monto'], reverse=True)
                
                results.append({
                    "empresa": c,
                    "emite": emite,
                    "recibe": recibe,
                    "ratio": ratio,
                    "proveedores": prov_list
                })
                
        return sorted(results, key=lambda x: x['recibe'], reverse=True)

    def get_efos_risk(self, empresa=None, start_date=None, end_date=None, min_empresas=3):
        """Detects clients receiving invoices from multiple firm companies (potential EFOS/EDOS pulverization)."""
        if self.df_facturas.empty:
            return []
            
        df = self.apply_filters(self.df_facturas, None, None, start_date, end_date)
        if df.empty:
            return []
            
        if 'ESTATUS DE COBRO' in df.columns:
            df = df[df['ESTATUS DE COBRO'] != 'Cancelado'].copy()
            
        # Filter by requested empresa if any to see its clients
        if empresa:
            clientes_of_empresa = set(df[df['EMPRESA'] == empresa]['CLIENTE'].unique())
            df = df[df['CLIENTE'].isin(clientes_of_empresa)]
            
        multi = df.groupby('CLIENTE').agg({'EMPRESA': 'nunique', 'TOTAL NETO': 'sum'}).reset_index()
        multi.columns = ['cliente', 'num_empresas', 'total']
        multi = multi[multi['num_empresas'] >= min_empresas].sort_values('total', ascending=False)
        
        if multi.empty:
            return []
            
        clientes_multi = multi['cliente'].tolist()
        # Group by CLIENTE and EMPRESA once
        emps_df = df[df['CLIENTE'].isin(clientes_multi)].groupby(['CLIENTE', 'EMPRESA'])['TOTAL NETO'].sum().reset_index()
        
        # Build dict of lists
        emps_dict = {}
        for row in emps_df.to_dict('records'):
            c = row['CLIENTE']
            if c not in emps_dict:
                emps_dict[c] = []
            emps_dict[c].append({"empresa": row['EMPRESA'], "monto": float(row['TOTAL NETO'])})
        
        results = []
        for row in multi.to_dict('records'):
            cliente = row['cliente']
            emps_list = emps_dict.get(cliente, [])
            emps_list.sort(key=lambda x: x['monto'], reverse=True)
            
            results.append({
                "cliente": cliente,
                "num_empresas": int(row['num_empresas']),
                "total_recibido": float(row['total']),
                "empresas_emisoras": emps_list
            })
            
        return results

db = DataEngine()
