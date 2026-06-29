"""Risk analysis engine for SAT-focused alerts and scoring."""

from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional

import pandas as pd  # type: ignore


@dataclass
class RiskFactorConfig:
    key: str
    label: str
    weight: float


RISK_FACTORS = [
    RiskFactorConfig("concentration", "Concentración de claves", 25.0),
    RiskFactorConfig("materiality", "Materialidad insuficiente", 25.0),
    RiskFactorConfig("round_amounts", "Montos redondos", 20.0),
    RiskFactorConfig("low_diversity", "Baja diversidad de claves", 15.0),
    RiskFactorConfig("high_average", "Importes promedio altos", 15.0),
]

RISK_FACTOR_LABELS = {cfg.key: cfg.label for cfg in RISK_FACTORS}

HIGH_RISK_CLAVES = {
    1010101,
    84111506,
    80131500,
    43211500,
    78101800,
    80101500,
    54101500,
}


@dataclass
class ClientRiskResult:
    cliente: str
    total_importe: float
    total_registros: int
    claves_distintas: int
    top_clave: Optional[int]
    top_clave_ratio: float
    materiality_ratio: float
    montos_redondos_ratio: float
    average_importe: float
    risk_score: float
    risk_level: str
    risk_factors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, object]:
        return asdict(self)


class RiskAnalyzer:
    def __init__(self, df_conceptos: pd.DataFrame, df_facturas: pd.DataFrame):
        self.df_conceptos = df_conceptos.copy()
        self.df_facturas = df_facturas.copy()
        self._prepare_dataframes()

    def _prepare_dataframes(self):
        if not self.df_conceptos.empty:
            if 'CLIENTE' in self.df_conceptos.columns:
                self.df_conceptos['CLIENTE'] = self.df_conceptos['CLIENTE'].astype(str)
            if 'DESCRIPCION SAT' in self.df_conceptos.columns:
                self.df_conceptos['DESCRIPCION SAT'] = self.df_conceptos['DESCRIPCION SAT'].astype(str)
            if 'DESCRIPCION' in self.df_conceptos.columns:
                self.df_conceptos['DESCRIPCION'] = self.df_conceptos['DESCRIPCION'].astype(str)

        if not self.df_facturas.empty:
            if 'CLIENTE' in self.df_facturas.columns:
                self.df_facturas['CLIENTE'] = self.df_facturas['CLIENTE'].astype(str)

    def _calculate_risk_score(self, metrics: Dict[str, float]):
        score = 0.0
        factors = []

        if metrics.get('top_clave_ratio', 0) >= 0.8:
            score += 25
            factors.append('concentration')
        elif metrics.get('top_clave_ratio', 0) >= 0.6:
            score += 15

        if metrics.get('materiality_ratio', 0) >= 0.5:
            score += 25
            factors.append('materiality')
        elif metrics.get('materiality_ratio', 0) >= 0.2:
            score += 15

        if metrics.get('montos_redondos_ratio', 0) >= 0.3:
            score += 20
            factors.append('round_amounts')
        elif metrics.get('montos_redondos_ratio', 0) >= 0.1:
            score += 10

        if metrics.get('claves_distintas', 0) <= 2:
            score += 15
            factors.append('low_diversity')
        elif metrics.get('claves_distintas', 0) <= 5:
            score += 8

        if metrics.get('average_importe', 0) >= 100000:
            score += 15
            factors.append('high_average')
        elif metrics.get('average_importe', 0) >= 50000:
            score += 8

        score = min(score, 100)
        if score >= 60:
            level = 'ALTO'
        elif score >= 30:
            level = 'MEDIO'
        else:
            level = 'BAJO'
        return score, factors, level

    def _calculate_metrics_for_client(self, cliente: str) -> Optional[ClientRiskResult]:
        df_cli_conceptos = self.df_conceptos[self.df_conceptos['CLIENTE'] == cliente]
        df_cli_facturas = self.df_facturas[self.df_facturas['CLIENTE'] == cliente]

        if df_cli_conceptos.empty and df_cli_facturas.empty:
            return None

        total_importe = float(df_cli_conceptos['IMPORTE'].sum()) if not df_cli_conceptos.empty else 0.0
        total_registros = int(len(df_cli_conceptos)) if not df_cli_conceptos.empty else 0

        claves_distintas = int(df_cli_conceptos['CLAVE PROD/SERV'].nunique()) if not df_cli_conceptos.empty else 0
        top_clave_ratio = 0.0
        top_clave = None
        if claves_distintas > 0:
            clave_counts = df_cli_conceptos['CLAVE PROD/SERV'].value_counts()
            top_clave = int(clave_counts.index[0])
            top_clave_ratio = float(clave_counts.iloc[0]) / float(total_registros)

        desc_problematic = 0
        if not df_cli_conceptos.empty:
            desc_col = 'DESCRIPCION SAT' if 'DESCRIPCION SAT' in df_cli_conceptos.columns else 'DESCRIPCION'
            if desc_col in df_cli_conceptos.columns:
                desc_problematic = len(df_cli_conceptos[
                    (df_cli_conceptos[desc_col].isna()) |
                    (df_cli_conceptos[desc_col].str.strip() == '') |
                    (df_cli_conceptos[desc_col].str.strip() == '.') |
                    (df_cli_conceptos[desc_col].str.lower().isin(['servicio', 'producto', 'pago']))
                ])
        materiality_ratio = (desc_problematic / total_registros) if total_registros > 0 else 0

        def is_round(amount: float) -> bool:
            if amount <= 0:
                return False
            return amount % 10000 == 0 or amount % 50000 == 0 or amount % 100000 == 0

        montos_redondos = 0
        if not df_cli_facturas.empty:
            montos_redondos = len(df_cli_facturas[df_cli_facturas['TOTAL NETO'].apply(is_round)])
        montos_redondos_ratio = (montos_redondos / len(df_cli_facturas)) if len(df_cli_facturas) > 0 else 0

        average_importe = (total_importe / total_registros) if total_registros > 0 else 0

        metrics = {
            'top_clave_ratio': top_clave_ratio,
            'materiality_ratio': materiality_ratio,
            'montos_redondos_ratio': montos_redondos_ratio,
            'claves_distintas': claves_distintas,
            'average_importe': average_importe,
        }

        score, factors, level = self._calculate_risk_score(metrics)

        return ClientRiskResult(
            cliente=cliente,
            total_importe=total_importe,
            total_registros=total_registros,
            claves_distintas=claves_distintas,
            top_clave=top_clave,
            top_clave_ratio=round(top_clave_ratio, 3),
            materiality_ratio=round(materiality_ratio, 3),
            montos_redondos_ratio=round(montos_redondos_ratio, 3),
            average_importe=round(average_importe, 2),
            risk_score=round(score, 1),
            risk_level=level,
            risk_factors=factors,
        )

    def analyze_clients(self, min_records: int = 3) -> List[ClientRiskResult]:
        clients = sorted(self.df_conceptos['CLIENTE'].dropna().unique().tolist()) if not self.df_conceptos.empty else []
        results: List[ClientRiskResult] = []
        for cliente in clients:
            result = self._calculate_metrics_for_client(cliente)
            if result and result.total_registros >= min_records:
                results.append(result)
        return results

    def get_top_risky_clients(self, top_n: int = 20) -> List[ClientRiskResult]:
        results = self.analyze_clients()
        results.sort(key=lambda r: (r.risk_score, r.total_importe), reverse=True)
        return results[:top_n]

    def get_clave_insights(self) -> Dict[str, List[Dict[str, object]]]:
        if self.df_conceptos.empty:
            return {'top_claves': [], 'high_risk_claves': []}

        desc_col = 'DESCRIPCION SAT' if 'DESCRIPCION SAT' in self.df_conceptos.columns else 'DESCRIPCION'
        top_claves = (
            self.df_conceptos
            .groupby(['CLAVE PROD/SERV', desc_col])['IMPORTE']
            .sum()
            .reset_index()
            .sort_values('IMPORTE', ascending=False)
            .head(15)
        )
        top_claves_records = [
            {
                'clave': int(row['CLAVE PROD/SERV']),
                'descripcion': row[desc_col],
                'importe': float(row['IMPORTE'])
            }
            for _, row in top_claves.iterrows()
        ]

        high_risk_claves_df = self.df_conceptos[self.df_conceptos['CLAVE PROD/SERV'].isin(HIGH_RISK_CLAVES)]
        high_risk_summary = (
            high_risk_claves_df.groupby('CLAVE PROD/SERV')['IMPORTE']
            .agg(['count', 'sum'])
            .reset_index()
            .sort_values('sum', ascending=False)
        )
        high_risk_records = []
        for _, row in high_risk_summary.iterrows():
            clave = int(row['CLAVE PROD/SERV'])
            descripcion = self.df_conceptos[self.df_conceptos['CLAVE PROD/SERV'] == clave][desc_col].iloc[0]
            high_risk_records.append({
                'clave': clave,
                'descripcion': descripcion,
                'registros': int(row['count']),
                'importe': float(row['sum'])
            })

        return {
            'top_claves': top_claves_records,
            'high_risk_claves': high_risk_records,
        }

    def get_clients_summary(self, min_records: int = 3) -> Dict[str, object]:
        results = self.analyze_clients(min_records=min_records)
        if not results:
            return {
                "total_clients": 0,
                "level_counts": {},
                "factor_counts": {},
                "average_score": 0,
                "total_importe": 0,
                "factor_labels": RISK_FACTOR_LABELS,
            }

        level_counts = Counter(result.risk_level for result in results)
        factor_counts = Counter()
        for result in results:
            factor_counts.update(result.risk_factors)

        average_score = sum(r.risk_score for r in results) / len(results)
        total_importe = sum(r.total_importe for r in results)

        return {
            "total_clients": len(results),
            "level_counts": dict(level_counts),
            "factor_counts": dict(factor_counts),
            "average_score": round(average_score, 1),
            "total_importe": round(total_importe, 2),
            "factor_labels": RISK_FACTOR_LABELS,
        }

    def get_materiality_alerts(
        self, *, threshold: float = 0.35, max_results: int = 15, min_records: int = 1
    ) -> List[Dict[str, object]]:
        results = self.analyze_clients(min_records=min_records)
        alerts = [result for result in results if result.materiality_ratio >= threshold]
        alerts.sort(key=lambda r: (r.materiality_ratio, r.total_registros), reverse=True)
        return [alert.to_dict() for alert in alerts[:max_results]]

    def get_risk_diagnostic(self) -> Dict[str, object]:
        return {
            "summary": self.get_clients_summary(),
            "top_clients": [r.to_dict() for r in self.get_top_risky_clients(5)],
            "materiality_alerts": self.get_materiality_alerts(),
            "clave_insights": self.get_clave_insights(),
        }


def build_risk_analyzer(db_engine) -> Optional[RiskAnalyzer]:
    if getattr(db_engine, 'df_conceptos', None) is None or db_engine.df_conceptos.empty:
        return None
    return RiskAnalyzer(db_engine.df_conceptos, db_engine.df_facturas)
