from collections import defaultdict
from typing import List, Dict
import pandas as pd  # type: ignore


class ConcentrationAnalyzer:
    def __init__(self, df_conceptos):
        self.df = df_conceptos.copy()

    def income_mix(self) -> Dict:
        df = self.df.copy()
        if df.empty:
            return {"tipo_ingreso": []}

        desc_col = 'DESCRIPCION SAT' if 'DESCRIPCION SAT' in df.columns else 'DESCRIPCION'
        mix = df.groupby(desc_col)['IMPORTE'].sum().reset_index()
        mix.columns = ['tipo', 'monto']
        mix = mix.sort_values('monto', ascending=False)
        total = mix['monto'].sum() or 1
        mix['porcentaje'] = (mix['monto'] / total * 100).round(1)
        return {"tipo_ingreso": mix.head(20).to_dict(orient='records')}

    def hhi_index(self) -> List[Dict]:
        mix = self.income_mix()
        if not mix:
            return []
        total = sum(item['value'] for item in mix) or 1
        hhi = []
        for item in mix:
            share = (item['value'] / total) * 100
            hhi.append({
                'category': item['category'],
                'share': round(share, 2),
            })
        return hhi

    def product_service_ratio(self, df_facturas=None) -> Dict:
        df = self.df.copy()
        empty = {
            "concept_mix": [],
            "invoice_donut": [],
            "invoice_detail": [],
        }
        if df.empty:
            return empty

        # Find unit column
        if 'UNIDAD' in df.columns:
            col_unidad = 'UNIDAD'
        elif 'CLAVE UNIDAD' in df.columns:
            col_unidad = 'CLAVE UNIDAD'
        else:
            col_unidad = None
            for col in df.columns:
                if 'UNIDAD' in col.upper():
                    col_unidad = col
                    break
        if not col_unidad:
            return empty

        # ---- Panel 1: Concept-level mix (by IMPORTE) ----
        service_units = ['E48', 'E49', 'E54', 'HUR']
        is_service = df[col_unidad].astype(str).str.strip().str.upper().isin(service_units)
        svc_importe = float(df.loc[is_service, 'IMPORTE'].sum())
        prod_importe = float(df.loc[~is_service, 'IMPORTE'].sum())
        total_importe = svc_importe + prod_importe or 1.0

        concept_mix = [
            {"tipo": "Servicio", "monto": svc_importe, "pct": round(svc_importe / total_importe * 100, 1)},
            {"tipo": "Producto", "monto": prod_importe, "pct": round(prod_importe / total_importe * 100, 1)},
        ]

        # ---- Panel 2 & 3: Invoice-level classification ----
        uuid_col = 'UUID' if 'UUID' in df.columns else None
        if not uuid_col:
            return {"concept_mix": concept_mix, "invoice_donut": [], "invoice_detail": []}

        # Classify each invoice by its concepts' unit codes
        grouped = df.groupby(uuid_col)[col_unidad].apply(
            lambda vals: set(v.strip().upper() for v in vals.astype(str))
        )

        def classify(units):
            service_units_set = {'E48', 'E49', 'E54', 'HUR'}
            has_service = bool(units.intersection(service_units_set))
            has_other = bool(units - service_units_set)
            
            if has_service and has_other:
                return 'Mixta'
            elif has_service:
                return 'Servicio'
            else:
                return 'Producto'

        uuid_class = grouped.apply(classify).reset_index()
        uuid_class.columns = [uuid_col, 'clasificacion']

        # Get invoice totals
        if df_facturas is not None and not df_facturas.empty and uuid_col in df_facturas.columns:
            inv = df_facturas[[uuid_col, 'TOTAL NETO']].copy()
            inv = inv.merge(uuid_class, on=uuid_col, how='inner')
        else:
            inv_totals = df.groupby(uuid_col)['IMPORTE'].sum().reset_index()
            inv_totals.columns = [uuid_col, 'TOTAL NETO']
            inv = inv_totals.merge(uuid_class, on=uuid_col, how='inner')

        total_facturas = len(inv) or 1
        total_monto_inv = float(inv['TOTAL NETO'].sum()) or 1.0

        detail = []
        for cat in ['Servicio', 'Producto', 'Mixta']:
            subset = inv[inv['clasificacion'] == cat]
            count = int(len(subset))
            monto = float(subset['TOTAL NETO'].sum())
            detail.append({
                "tipo": cat,
                "count": count,
                "count_pct": round(count / total_facturas * 100, 1),
                "monto": monto,
                "monto_pct": round(monto / total_monto_inv * 100, 1),
            })

        invoice_donut = [{"name": d["tipo"], "value": d["monto"]} for d in detail if d["monto"] > 0]

        return {
            "concept_mix": concept_mix,
            "invoice_donut": invoice_donut,
            "invoice_detail": detail,
        }

    def get_product_service_drilldown(self, tipo: str, df_facturas: pd.DataFrame = None):
        """Returns details (top concepts and top invoices) for a specific classification ('Servicio', 'Producto', 'Mixta')"""
        if self.df is None or self.df.empty:
            return {"top_concepts": [], "top_invoices": []}

        df = self.df.copy()
        
        # 1. Classify all invoices just like product_service_ratio
        uuid_col = 'UUID FACTURA' if 'UUID FACTURA' in df.columns else 'UUID'
        if uuid_col not in df.columns:
            return {"top_concepts": [], "top_invoices": []}

        # Validate units
        valid_units = ['CLAVE UNIDAD', 'CLAVEUNIDAD', 'UNIDAD']
        unit_col = next((c for c in valid_units if c in df.columns), None)
        
        if not unit_col:
            # If no unit column, assume everything is Producto (fallback)
            if tipo != 'Producto':
                return {"top_concepts": [], "top_invoices": []}
            uuid_class = pd.DataFrame({uuid_col: df[uuid_col].unique(), 'clasificacion': 'Producto'})
        else:
            # Normal classification
            df[unit_col] = df[unit_col].astype(str).str.strip().str.upper()
            grouped = df.groupby(uuid_col)[unit_col].apply(set)

            def classify(units):
                service_units_set = {'E48', 'E49', 'E54', 'HUR'}
                has_service = bool(units.intersection(service_units_set))
                has_other = bool(units - service_units_set)
                
                if has_service and has_other:
                    return 'Mixta'
                elif has_service:
                    return 'Servicio'
                else:
                    return 'Producto'

            uuid_class = grouped.apply(classify).reset_index()
            uuid_class.columns = [uuid_col, 'clasificacion']

        # 2. Filter UUIDs that match the requested 'tipo'
        target_uuids = uuid_class[uuid_class['clasificacion'] == tipo][uuid_col].tolist()
        
        if not target_uuids:
             return {"top_concepts": [], "top_invoices": []}

        # 3. Top Concepts for these UUIDs
        concepts_subset = df[df[uuid_col].isin(target_uuids)].copy()
        
        sat_col = 'CLAVE PROD/SERV' if 'CLAVE PROD/SERV' in concepts_subset.columns else None
        if 'DESCRIPCION SAT' in concepts_subset.columns:
            desc_col = 'DESCRIPCION SAT'
        elif 'DESCRIPCION' in concepts_subset.columns:
            desc_col = 'DESCRIPCION'
        else:
            desc_col = None
        
        if sat_col and desc_col:
            # Clean up the clave sat column for grouping
            concepts_subset['_clave_curated'] = concepts_subset[sat_col].astype(str).str.replace(r'\.0$', '', regex=True).str.strip()
            
            # Group by Clave SAT
            grouped_sum = concepts_subset.groupby('_clave_curated')['IMPORTE'].sum().reset_index()
            # Mapping: Clave SAT -> First valid description found
            desc_map = concepts_subset.drop_duplicates(subset=['_clave_curated']).set_index('_clave_curated')[desc_col].to_dict()
            
            concept_group = grouped_sum.sort_values(by='IMPORTE', ascending=False)
            total_importe = concept_group['IMPORTE'].sum() or 1
            
            top_concepts = []
            for _, row in concept_group.head(20).iterrows():
                if row['IMPORTE'] <= 0: continue
                c_sat = row['_clave_curated']
                c_desc = str(desc_map.get(c_sat, ''))
                
                # If description is just noise, only show clave
                if len(c_desc.strip()) <= 2:
                    label = f"{c_sat}"
                else:
                    label = f"{c_sat} - {c_desc}"
                    
                top_concepts.append({
                    "descripcion": label,
                    "monto": float(row['IMPORTE']),
                    "porcentaje": round((float(row['IMPORTE']) / total_importe) * 100, 1),
                    "clave_sat": c_sat
                })
        elif desc_col:
            concept_group = concepts_subset.groupby(desc_col)['IMPORTE'].sum().reset_index()
            concept_group = concept_group.sort_values(by='IMPORTE', ascending=False)
            
            total_importe = concept_group['IMPORTE'].sum() or 1
            
            top_concepts = []
            for _, row in concept_group.head(20).iterrows(): # Top 20 concepts
                if row['IMPORTE'] <= 0: continue
                top_concepts.append({
                    "descripcion": str(row[desc_col]),
                    "monto": float(row['IMPORTE']),
                    "porcentaje": round((float(row['IMPORTE']) / total_importe) * 100, 1)
                })
        else:
            top_concepts = []
        top_invoices = []
        if df_facturas is not None and not df_facturas.empty:
            inv_uuid_col = 'UUID'
            if inv_uuid_col in df_facturas.columns:
                inv_subset = df_facturas[df_facturas[inv_uuid_col].isin(target_uuids)].copy()
                inv_subset = inv_subset.sort_values(by='TOTAL NETO', ascending=False)
                
                for _, row in inv_subset.head(50).iterrows(): # Top 50 invoices Max
                    try:
                        fecha = row['FECHA']
                        if pd.notnull(fecha):
                            if isinstance(fecha, str):
                                fecha_str = fecha[:10]
                            else:
                                fecha_str = fecha.strftime('%Y-%m-%d')
                        else:
                            fecha_str = "N/A"
                    except:
                        fecha_str = "N/A"
                        
                    top_invoices.append({
                        "uuid": str(row[inv_uuid_col]),
                        "folio": str(row.get('FOLIO', '')),
                        "fecha": fecha_str,
                        "cliente": str(row.get('CLIENTE', 'Desconocido')),
                        "monto": float(row.get('TOTAL NETO', 0.0))
                    })
                    
        return {
            "top_concepts": top_concepts,
            "top_invoices": top_invoices
        }

    def get_concept_invoices(self, tipo: str, descripcion: str, clave_sat: str = None, df_facturas: pd.DataFrame = None):
        """Returns individual invoice lines for a specific concept within a tipo classification"""
        if self.df is None or self.df.empty:
            return {"invoices": []}

        df = self.df.copy()
        uuid_col = 'UUID FACTURA' if 'UUID FACTURA' in df.columns else 'UUID'
        if uuid_col not in df.columns:
            return {"invoices": []}

        # Classify UUIDs
        valid_units = ['CLAVE UNIDAD', 'CLAVEUNIDAD', 'UNIDAD']
        unit_col = next((c for c in valid_units if c in df.columns), None)

        if not unit_col:
            if tipo != 'Producto':
                return {"invoices": []}
            target_uuids = df[uuid_col].unique().tolist()
        else:
            df[unit_col] = df[unit_col].astype(str).str.strip().str.upper()
            grouped = df.groupby(uuid_col)[unit_col].apply(set)

            def classify(units):
                service_units_set = {'E48', 'E49', 'E54', 'HUR'}
                has_service = bool(units.intersection(service_units_set))
                has_other = bool(units - service_units_set)
                if has_service and has_other:
                    return 'Mixta'
                elif has_service:
                    return 'Servicio'
                else:
                    return 'Producto'

            uuid_class = grouped.apply(classify).reset_index()
            uuid_class.columns = [uuid_col, 'clasificacion']
            target_uuids = uuid_class[uuid_class['clasificacion'] == tipo][uuid_col].tolist()

        if not target_uuids:
            return {"invoices": []}

        # Filter by concept description or clave_sat
        sat_col = 'CLAVE PROD/SERV' if 'CLAVE PROD/SERV' in df.columns else None
        if 'DESCRIPCION SAT' in df.columns:
            desc_col = 'DESCRIPCION SAT'
        elif 'DESCRIPCION' in df.columns:
            desc_col = 'DESCRIPCION'
        else:
            desc_col = None

        if clave_sat and sat_col:
            df['_clave_curated'] = df[sat_col].astype(str).str.replace(r'\.0$', '', regex=True).str.strip()
            subset = df[(df[uuid_col].isin(target_uuids)) & (df['_clave_curated'] == clave_sat)].copy()
        elif desc_col:
            subset = df[(df[uuid_col].isin(target_uuids)) & (df[desc_col] == descripcion)].copy()
        else:
            return {"invoices": []}

        subset = subset.sort_values(by='IMPORTE', ascending=False)

        invoices = []
        for _, row in subset.head(100).iterrows():
            try:
                fecha = row.get('FECHA', None)
                if pd.notnull(fecha):
                    fecha_str = fecha[:10] if isinstance(fecha, str) else fecha.strftime('%Y-%m-%d')
                else:
                    fecha_str = "N/A"
            except:
                fecha_str = "N/A"

            invoices.append({
                "uuid": str(row.get(uuid_col, '')),
                "folio": str(row.get('FOLIO', row.get('FOLIO FACTURA', ''))),
                "fecha": fecha_str,
                "cliente": str(row.get('CLIENTE', row.get('NOMBRE CLIENTE', 'Desconocido'))),
                "rfc_cliente": str(row.get('RFC CLIENTE', row.get('RFC', ''))),
                "descripcion": str(row.get(desc_col, '')),
                "cantidad": float(row.get('CANTIDAD', 1)),
                "precio_unitario": float(row.get('PRECIO UNITARIO', row.get('VALOR UNITARIO', 0))),
                "importe": float(row.get('IMPORTE', 0)),
            })

        return {"invoices": invoices, "total": len(invoices)}
