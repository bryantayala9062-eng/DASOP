from typing import Dict
from datetime import time


class AnomalyDetector:
    def __init__(self, engine):
        self.engine = engine

    def iva_ratio_anomalies(self):
        df = self.engine.df_facturas.copy()
        if df.empty:
            return []
        df['IVA_CALCULADO'] = df['TOTAL ANTES DE IVA'] * 0.16
        df['ratio'] = (df['TOTAL NETO'] - df['TOTAL ANTES DE IVA']) / df['TOTAL ANTES DE IVA']
        anomalies = df[(df['TOTAL ANTES DE IVA'] > 0) & ((df['ratio'] < 0.15) | (df['ratio'] > 0.17))]
        cols = ['UUID', 'FOLIO', 'FECHA', 'EMPRESA', 'CLIENTE', 'TOTAL ANTES DE IVA', 'TOTAL NETO', 'ratio']
        return anomalies[cols].head(100).to_dict(orient='records')

    def generic_descriptions(self):
        df = self.engine.df_conceptos.copy()
        if df.empty:
            return []
        desc_col = 'DESCRIPCION SAT' if 'DESCRIPCION SAT' in df.columns else 'DESCRIPCION'
        if desc_col not in df.columns:
            return []
        generics = df[df[desc_col].str.len() < 15].copy()
        generics['DESCRIPCION_MOSTRAR'] = generics[desc_col]
        return generics[['UUID', 'DESCRIPCION_MOSTRAR', 'IMPORTE']].rename(columns={'DESCRIPCION_MOSTRAR': 'DESCRIPCION'}).head(100).to_dict(orient='records')

    def nocturnal_invoices(self):
        df = self.engine.df_facturas.copy()
        if df.empty or 'HORA TIMBRADO' not in df.columns:
            return []
        df['hora'] = df['HORA TIMBRADO'].astype(str).str[:2].astype(int)
        noct = df[(df['hora'] < 6) | (df['hora'] > 22)]
        return noct[['UUID', 'FECHA', 'CLIENTE', 'TOTAL NETO', 'hora']].head(100).to_dict(orient='records')

    def temporal_concentration(self):
        df = self.engine.df_facturas.copy()
        if df.empty:
            return []
        daily = df.groupby(['EMPRESA', 'FECHA']).agg({'UUID': 'count', 'TOTAL NETO': 'sum'}).reset_index()
        return daily[daily['UUID'] > 10].sort_values('UUID', ascending=False).head(100).to_dict(orient='records')

    def run_all(self) -> Dict[str, list]:
        return {
            'iva_ratio': self.iva_ratio_anomalies(),
            'generic_descriptions': self.generic_descriptions(),
            'nocturnal': self.nocturnal_invoices(),
            'temporal_concentration': self.temporal_concentration(),
        }
