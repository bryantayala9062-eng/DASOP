"""
SAT Risk Engine — 8 motores de detección fiscal inteligente.

Cada motor analiza un aspecto distinto de las facturas/conceptos/pagos
y genera alertas con severidad, monto implicado y detalle accionable.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional
from datetime import datetime
import pandas as pd
import numpy as np


# ── Severity levels ──────────────────────────────────────
SEVERIDAD_CRITICO = "CRITICO"
SEVERIDAD_ALTO = "ALTO"
SEVERIDAD_MEDIO = "MEDIO"

SEVERIDAD_WEIGHT = {SEVERIDAD_CRITICO: 3, SEVERIDAD_ALTO: 2, SEVERIDAD_MEDIO: 1}


@dataclass
class RiskAlert:
    """Single risk alert produced by a detection engine."""
    tipo: str
    severidad: str
    folio: str
    uuid: str
    empresa: str
    cliente: str
    monto: float
    fecha: str
    descripcion: str
    detalles: Dict = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class RiskCategory:
    """Aggregated results for one detection category."""
    id: str
    titulo: str
    severidad: str
    icono: str
    count: int = 0
    monto_total: float = 0.0
    alertas: List[Dict] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "titulo": self.titulo,
            "severidad": self.severidad,
            "icono": self.icono,
            "count": self.count,
            "monto_total": self.monto_total,
            "alertas": self.alertas[:100],  # cap at 100 per category
        }


class SATRiskEngine:
    """Runs 8 detection algorithms on the ERP dataset."""

    def __init__(
        self,
        df_facturas: pd.DataFrame,
        df_conceptos: pd.DataFrame,
        df_complementos: pd.DataFrame,
    ):
        self.df_f = df_facturas.copy()
        self.df_c = df_conceptos.copy()
        self.df_comp = df_complementos.copy()
        self._prepare()

    # ── Preparation ──────────────────────────────────────
    def _prepare(self):
        """Ensure numeric and date columns are clean for analysis."""
        num_cols_f = ["TOTAL NETO", "TOTAL ANTES DE IVA", "SALDO PENDIENTE", "TOTAL PAGADO"]
        for col in num_cols_f:
            if col in self.df_f.columns:
                self.df_f[col] = pd.to_numeric(self.df_f[col], errors="coerce").fillna(0)

        if "FECHA" in self.df_f.columns:
            self.df_f["FECHA"] = pd.to_datetime(self.df_f["FECHA"], errors="coerce")

        num_cols_c = ["VALOR UNITARIO", "IMPORTE", "CANTIDAD"]
        for col in num_cols_c:
            if col in self.df_c.columns:
                self.df_c[col] = pd.to_numeric(self.df_c[col], errors="coerce").fillna(0)

        if "CLAVE PROD/SERV" in self.df_c.columns:
            self.df_c["CLAVE PROD/SERV"] = (
                pd.to_numeric(self.df_c["CLAVE PROD/SERV"], errors="coerce")
                .fillna(0)
                .astype(int)
            )

        num_cols_comp = ["IMPORTE PAGADO", "SALDO INSOLUTO", "SALDO ANTERIOR", "MONTO PAGO TOTAL"]
        for col in num_cols_comp:
            if col in self.df_comp.columns:
                self.df_comp[col] = pd.to_numeric(self.df_comp[col], errors="coerce").fillna(0)

    # ── Helper ───────────────────────────────────────────
    def _make_alert(self, tipo, severidad, row, desc, detalles=None) -> RiskAlert:
        fecha_val = row.get("FECHA", "")
        if isinstance(fecha_val, pd.Timestamp):
            fecha_val = fecha_val.strftime("%Y-%m-%d")
        return RiskAlert(
            tipo=tipo,
            severidad=severidad,
            folio=str(row.get("FOLIO", "")),
            uuid=str(row.get("UUID", "")),
            empresa=str(row.get("EMPRESA", "")),
            cliente=str(row.get("CLIENTE", "")),
            monto=float(row.get("TOTAL NETO", row.get("IMPORTE", 0))),
            fecha=str(fecha_val),
            descripcion=desc,
            detalles=detalles or {},
        )

    # ═════════════════════════════════════════════════════
    #  MOTOR 1: Discrepancia IVA (CRÍTICO)
    # ═════════════════════════════════════════════════════
    def detect_iva_discrepancy(self) -> List[RiskAlert]:
        """Flags invoices where the IVA ratio deviates from expected standard rates."""
        alerts = []
        df = self.df_f
        if df.empty or "TOTAL ANTES DE IVA" not in df.columns:
            return alerts

        mask = df["TOTAL ANTES DE IVA"] > 100  # skip trivial amounts
        subset = df[mask].copy()
        subset["iva_ratio"] = (
            (subset["TOTAL NETO"] - subset["TOTAL ANTES DE IVA"]) / subset["TOTAL ANTES DE IVA"]
        )

        anomalies = []
        for _, row in subset.iterrows():
            ratio = row["iva_ratio"]
            ratio_pct = round(ratio * 100, 2)
            
            # Tasas válidas esperadas (16%, 8% fronteriza, 0% o exento)
            # Ignoramos si están dentro del margen de estas tasas "puras"
            if (ratio >= -0.01 and ratio <= 0.01) or \
               (ratio >= 0.075 and ratio <= 0.085) or \
               (ratio >= 0.155 and ratio <= 0.165):
                continue
            
            # Si el IVA es negativo, siempre es anomalía
            # Las tasas intermedias indican facturas mixtas o errores de cálculo.
            iva_esperado = round(row["TOTAL ANTES DE IVA"] * 0.16, 2)
            iva_real = round(row["TOTAL NETO"] - row["TOTAL ANTES DE IVA"], 2)
            diff = round(abs(iva_real - iva_esperado), 2)
            
            anomalies.append((row, ratio_pct, iva_esperado, iva_real, diff))

        for row, ratio_pct, iva_esperado, iva_real, diff in anomalies:
            alerts.append(self._make_alert(
                "iva_discrepancia", SEVERIDAD_CRITICO, row,
                f"IVA al {ratio_pct}% (Atípico/Mixto). Diferencia vs 16%: ${diff:,.0f}",
                {"iva_ratio": ratio_pct, "iva_esperado": iva_esperado, "iva_real": iva_real, "diferencia": diff},
            ))
        return alerts

    # ═════════════════════════════════════════════════════
    #  MOTOR 2: Facturas Outlier / Estadístico (CRÍTICO)
    # ═════════════════════════════════════════════════════
    def detect_statistical_outliers(self) -> List[RiskAlert]:
        """Flags invoices whose amount is a statistical outlier (>P95 global OR >3x client median)."""
        alerts = []
        df = self.df_f
        if df.empty:
            return alerts

        p95 = df["TOTAL NETO"].quantile(0.95)

        # Global outliers: > P95
        global_outliers = df[df["TOTAL NETO"] > p95].copy()

        # Per-client outliers: > 3x client median (only clients with ≥5 invoices)
        client_stats = df.groupby("CLIENTE")["TOTAL NETO"].agg(["median", "count"]).reset_index()
        client_stats = client_stats[client_stats["count"] >= 5]
        client_medians = dict(zip(client_stats["CLIENTE"], client_stats["median"]))

        seen_uuids = set()
        for _, row in global_outliers.iterrows():
            uid = row["UUID"]
            if uid in seen_uuids:
                continue
            seen_uuids.add(uid)
            client_med = client_medians.get(row["CLIENTE"], p95)
            ratio = row["TOTAL NETO"] / max(client_med, 1)
            
            desc_global = f"Monto excepcionalmente alto a nivel general: ${row['TOTAL NETO']:,.0f} (el tope normal es ~${p95:,.0f})."
            if ratio >= 1.5:
                desc_global += f" Además, es {ratio:.1f} veces lo habitual para este cliente."
                
            alerts.append(self._make_alert(
                "factura_outlier", SEVERIDAD_CRITICO, row,
                desc_global,
                {"p95": p95, "mediana_cliente": client_med, "ratio": round(ratio, 2)},
            ))

        # Add client-specific outliers not already caught
        for _, row in df.iterrows():
            uid = row["UUID"]
            if uid in seen_uuids:
                continue
            client_med = client_medians.get(row["CLIENTE"])
            if client_med and row["TOTAL NETO"] > client_med * 3:
                seen_uuids.add(uid)
                ratio = row["TOTAL NETO"] / max(client_med, 1)
                alerts.append(self._make_alert(
                    "factura_outlier", SEVERIDAD_CRITICO, row,
                    f"Monto inusual para este cliente: ${row['TOTAL NETO']:,.0f}. Es {ratio:.1f} veces su promedio de compras habitual (~${client_med:,.0f}).",
                    {"mediana_cliente": client_med, "ratio": round(ratio, 2)},
                ))
        return alerts

    # ═════════════════════════════════════════════════════
    #  MOTOR 3: Facturas Clonadas / Duplicadas (CRÍTICO)
    # ═════════════════════════════════════════════════════
    def detect_clone_invoices(self) -> List[RiskAlert]:
        """Flags invoices with same CLIENT + same TOTAL NETO + same DATE."""
        alerts = []
        df = self.df_f
        if df.empty:
            return alerts

        df_work = df[df["TOTAL NETO"] > 1000].copy()  # skip trivial amounts
        df_work["FECHA_STR"] = df_work["FECHA"].dt.strftime("%Y-%m-%d")

        dupes = df_work.groupby(["CLIENTE", "TOTAL NETO", "FECHA_STR"]).filter(lambda g: len(g) > 1)

        seen_groups = set()
        for _, row in dupes.iterrows():
            key = (row["CLIENTE"], row["TOTAL NETO"], row["FECHA_STR"])
            group_count = len(dupes[
                (dupes["CLIENTE"] == row["CLIENTE"]) &
                (dupes["TOTAL NETO"] == row["TOTAL NETO"]) &
                (dupes["FECHA_STR"] == row["FECHA_STR"])
            ])
            if key not in seen_groups:
                seen_groups.add(key)

            alerts.append(self._make_alert(
                "factura_clonada", SEVERIDAD_CRITICO, row,
                f"{group_count} facturas idénticas: mismo cliente, monto ${row['TOTAL NETO']:,.0f}, misma fecha.",
                {"grupo_count": group_count, "fecha": row["FECHA_STR"]},
            ))
        return alerts

    # ═════════════════════════════════════════════════════
    #  MOTOR 4: Descripciones Sospechosas (ALTO)
    # ═════════════════════════════════════════════════════
    def detect_suspicious_descriptions(self) -> List[RiskAlert]:
        """Flags concepts with generic, empty, or meaningless descriptions."""
        alerts = []
        df = self.df_c
        if df.empty:
            return alerts
            
        desc_col = 'DESCRIPCION SAT' if 'DESCRIPCION SAT' in df.columns else 'DESCRIPCION'
        if desc_col not in df.columns:
            return alerts

        df_work = df.copy()
        df_work["DESC_CLEAN"] = df_work[desc_col].astype(str).str.strip().str.lower()
        df_work["DESC_LEN"] = df_work["DESC_CLEAN"].str.len()

        # Generic terms used to pad CFDI
        generic_terms = {
            "servicio", "servicios", "pago", "concepto", "producto", "productos",
            "venta", "ventas", "comision", "honorarios", "renta", "otros",
            ".", "..", "...", "-", "n/a", "na", "x", "xx", "xxx",
        }

        mask_empty = (df_work["DESC_CLEAN"] == "") | df_work[desc_col].isna()
        mask_short = df_work["DESC_LEN"] < 10
        mask_generic = df_work["DESC_CLEAN"].isin(generic_terms)
        mask_single_word = (~df_work["DESC_CLEAN"].str.contains(r"\s", na=False)) & (df_work["DESC_LEN"] < 20)

        flagged = df_work[mask_empty | mask_short | mask_generic].copy()

        for _, row in flagged.iterrows():
            desc = str(row.get(desc_col, ""))
            reason = "vacía" if pd.isna(row.get(desc_col)) or desc.strip() == "" else (
                f"genérica: \"{desc}\"" if desc.strip().lower() in generic_terms else f"muy corta ({len(desc.strip())} chars): \"{desc}\""
            )
            alerts.append(self._make_alert(
                "descripcion_sospechosa", SEVERIDAD_ALTO, row,
                f"Descripción {reason}. Importe: ${row.get('IMPORTE', 0):,.0f}",
                {"descripcion": desc, "importe": float(row.get("IMPORTE", 0)), "clave_sat": str(row.get("CLAVE PROD/SERV", ""))},
            ))
        return alerts

    # ═════════════════════════════════════════════════════
    #  MOTOR 5: Sobreprecio por Clave SAT (ALTO)
    # ═════════════════════════════════════════════════════
    def detect_overpricing(self) -> List[RiskAlert]:
        """Flags concepts where unit price > 3x the median for same SAT product code."""
        alerts = []
        df = self.df_c
        if df.empty or "VALOR UNITARIO" not in df.columns:
            return alerts

        valid = df[df["VALOR UNITARIO"] > 50].copy()
        if valid.empty:
            return alerts

        stats = valid.groupby("CLAVE PROD/SERV")["VALOR UNITARIO"].agg(["median", "count"]).reset_index()
        stats = stats[stats["count"] >= 3]  # need at least 3 transactions
        median_map = dict(zip(stats["CLAVE PROD/SERV"], stats["median"]))

        for _, row in valid.iterrows():
            clave = row["CLAVE PROD/SERV"]
            med = median_map.get(clave)
            if med and med > 0 and row["VALOR UNITARIO"] > med * 3:
                ratio = row["VALOR UNITARIO"] / med
                alerts.append(self._make_alert(
                    "sobreprecio", SEVERIDAD_ALTO, row,
                    f"Precio ${row['VALOR UNITARIO']:,.0f} es {ratio:.1f}× la mediana (${med:,.0f}) para clave {clave}.",
                    {
                        "precio_unitario": float(row["VALOR UNITARIO"]),
                        "mediana_clave": float(med),
                        "ratio": round(ratio, 2),
                        "clave_sat": str(clave),
                        "descripcion": str(row.get("DESCRIPCION SAT", row.get("DESCRIPCION", ""))),
                    },
                ))
        return alerts

    # ═════════════════════════════════════════════════════
    #  MOTOR 6: Montos Redondos Extremos (ALTO)
    # ═════════════════════════════════════════════════════
    def detect_round_amounts(self) -> List[RiskAlert]:
        """Flags invoices with suspiciously round totals (multiples of 50K+)."""
        alerts = []
        df = self.df_f
        if df.empty:
            return alerts

        thresholds = [
            (1_000_000, "múltiplo de $1,000,000"),
            (500_000, "múltiplo de $500,000"),
            (100_000, "múltiplo de $100,000"),
            (50_000, "múltiplo de $50,000"),
        ]

        for _, row in df.iterrows():
            total = row["TOTAL NETO"]
            if total < 50_000:
                continue
            for threshold, label in thresholds:
                if total % threshold == 0:
                    alerts.append(self._make_alert(
                        "monto_redondo", SEVERIDAD_ALTO, row,
                        f"${total:,.0f} — {label}. Los montos exactos son indicador de facturación simulada.",
                        {"threshold": threshold, "label": label},
                    ))
                    break  # only flag the highest matching threshold
        return alerts

    # ═════════════════════════════════════════════════════
    #  MOTOR 7: Concentración Temporal (MEDIO)
    # ═════════════════════════════════════════════════════
    def detect_temporal_concentration(self) -> List[RiskAlert]:
        """Flags clients with >5 invoices on the same calendar day."""
        alerts = []
        df = self.df_f
        if df.empty:
            return alerts

        df_work = df.copy()
        df_work["FECHA_STR"] = df_work["FECHA"].dt.strftime("%Y-%m-%d")

        daily = df_work.groupby(["CLIENTE", "FECHA_STR"]).agg(
            count=("UUID", "count"),
            total=("TOTAL NETO", "sum"),
            empresa=("EMPRESA", "first"),
        ).reset_index()

        concentrated = daily[daily["count"] > 5]
        for _, row in concentrated.iterrows():
            alerts.append(RiskAlert(
                tipo="concentracion_temporal",
                severidad=SEVERIDAD_MEDIO,
                folio=f"{row['count']} facturas",
                uuid="",
                empresa=str(row.get("empresa", "")),
                cliente=str(row["CLIENTE"]),
                monto=float(row["total"]),
                fecha=str(row["FECHA_STR"]),
                descripcion=f"{row['count']} facturas en un solo día por ${row['total']:,.0f}. Patrón de facturación masiva.",
                detalles={"count": int(row["count"]), "total_dia": float(row["total"])},
            ).to_dict())
            # Convert back to RiskAlert for consistency
        # Rebuild as RiskAlert objects
        result = []
        for _, row in concentrated.iterrows():
            alert = RiskAlert(
                tipo="concentracion_temporal",
                severidad=SEVERIDAD_MEDIO,
                folio=f"{row['count']} facturas",
                uuid="",
                empresa=str(row.get("empresa", "")),
                cliente=str(row["CLIENTE"]),
                monto=float(row["total"]),
                fecha=str(row["FECHA_STR"]),
                descripcion=f"{row['count']} facturas en un solo día por ${row['total']:,.0f}. Patrón de facturación masiva.",
                detalles={"count": int(row["count"]), "total_dia": float(row["total"])},
            )
            result.append(alert)
        return result

    # ═════════════════════════════════════════════════════
    #  MOTOR 8: Discrepancia Pago vs Factura (MEDIO)
    # ═════════════════════════════════════════════════════
    def detect_payment_discrepancies(self) -> List[RiskAlert]:
        """Flags complementos where payment > invoice total or negative balance."""
        alerts = []
        comp = self.df_comp
        if comp.empty:
            return alerts

        # Negative balances
        neg_balance = comp[comp["SALDO INSOLUTO"] < -0.01]
        for _, row in neg_balance.iterrows():
            alerts.append(RiskAlert(
                tipo="discrepancia_pago",
                severidad=SEVERIDAD_MEDIO,
                folio=str(row.get("FOLIO PAGO (REP)", "")),
                uuid=str(row.get("UUID", "")),
                empresa=str(row.get("EMPRESA", "")),
                cliente=str(row.get("CLIENTE", "")),
                monto=float(row.get("IMPORTE PAGADO", 0)),
                fecha=str(row.get("FECHA PAGO", "")),
                descripcion=f"Saldo insoluto negativo: ${row['SALDO INSOLUTO']:,.2f}. Pago mayor al saldo de la factura.",
                detalles={
                    "saldo_insoluto": float(row["SALDO INSOLUTO"]),
                    "importe_pagado": float(row.get("IMPORTE PAGADO", 0)),
                    "saldo_anterior": float(row.get("SALDO ANTERIOR", 0)),
                    "folio_relacionado": str(row.get("FOLIO RELACIONADO", "")),
                },
            ))

        # Payment > prior balance (overpayment)
        overpay = comp[
            (comp["SALDO ANTERIOR"] > 0) &
            (comp["IMPORTE PAGADO"] > comp["SALDO ANTERIOR"] * 1.01)  # 1% tolerance
        ]
        for _, row in overpay.iterrows():
            diff = row["IMPORTE PAGADO"] - row["SALDO ANTERIOR"]
            alerts.append(RiskAlert(
                tipo="discrepancia_pago",
                severidad=SEVERIDAD_MEDIO,
                folio=str(row.get("FOLIO PAGO (REP)", "")),
                uuid=str(row.get("UUID", "")),
                empresa=str(row.get("EMPRESA", "")),
                cliente=str(row.get("CLIENTE", "")),
                monto=float(row.get("IMPORTE PAGADO", 0)),
                fecha=str(row.get("FECHA PAGO", "")),
                descripcion=f"Pago (${row['IMPORTE PAGADO']:,.0f}) excede saldo anterior (${row['SALDO ANTERIOR']:,.0f}) por ${diff:,.0f}.",
                detalles={
                    "importe_pagado": float(row["IMPORTE PAGADO"]),
                    "saldo_anterior": float(row["SALDO ANTERIOR"]),
                    "exceso": float(diff),
                    "folio_relacionado": str(row.get("FOLIO RELACIONADO", "")),
                },
            ))
        return alerts

    # ═════════════════════════════════════════════════════
    #  FULL SCAN — runs all 8 engines
    # ═════════════════════════════════════════════════════
    # ═════════════════════════════════════════════════════
    def run_full_scan(self, empresa=None, cliente=None, startDate=None, endDate=None) -> Dict:
        """Execute all 8 detection engines and return consolidated report."""

        categories_config = [
            ("factura_outlier", "Facturas con Montos Atípicos", SEVERIDAD_CRITICO, "📊", self.detect_statistical_outliers),
            ("factura_clonada", "Facturas Clonadas / Duplicadas", SEVERIDAD_CRITICO, "🔄", self.detect_clone_invoices),
            ("descripcion_sospechosa", "Descripciones Sospechosas", SEVERIDAD_ALTO, "📝", self.detect_suspicious_descriptions),
            ("sobreprecio", "Sobreprecio por Clave SAT", SEVERIDAD_ALTO, "💰", self.detect_overpricing),
            ("monto_redondo", "Montos Redondos Sospechosos", SEVERIDAD_ALTO, "🎯", self.detect_round_amounts),
            ("concentracion_temporal", "Concentración Temporal", SEVERIDAD_MEDIO, "📅", self.detect_temporal_concentration),
            ("discrepancia_pago", "Discrepancia Pago vs Factura", SEVERIDAD_MEDIO, "💳", self.detect_payment_discrepancies),
        ]

        categorias = []
        total_alertas = 0
        monto_comprometido = 0.0
        por_severidad = {SEVERIDAD_CRITICO: 0, SEVERIDAD_ALTO: 0, SEVERIDAD_MEDIO: 0}

        for cat_id, titulo, severidad, icono, detect_fn in categories_config:
            try:
                raw_alerts = detect_fn()
                alert_dicts_all = [a.to_dict() if isinstance(a, RiskAlert) else a for a in raw_alerts]
            except Exception as e:
                print(f"[RiskEngine] Error in {cat_id}: {e}")
                alert_dicts_all = []

            # 1. Order by date descending (most recent first)
            alert_dicts_all.sort(key=lambda x: str(x.get("fecha", "1900-01-01")), reverse=True)

            # 2. Filter alerts
            alert_dicts = []
            years_filter = []
            start_date_filter = startDate
            if start_date_filter and str(start_date_filter).startswith("years:"):
                years_filter = [y.strip() for y in str(start_date_filter).replace("years:", "").split(",")]
                start_date_filter = None

            for a in alert_dicts_all:
                if empresa and str(a.get("empresa")) != empresa: continue
                if cliente and cliente.lower() not in str(a.get("cliente", "")).lower(): continue
                a_fecha = str(a.get("fecha", ""))[:10]
                if years_filter and a_fecha[:4] not in years_filter: continue
                if start_date_filter and a_fecha and a_fecha < start_date_filter: continue
                if endDate and a_fecha and a_fecha > endDate: continue
                alert_dicts.append(a)

            count = len(alert_dicts)
            monto = sum(a.get("monto", 0) for a in alert_dicts)

            categorias.append(RiskCategory(
                id=cat_id,
                titulo=titulo,
                severidad=severidad,
                icono=icono,
                count=count,
                monto_total=monto,
                alertas=alert_dicts,
            ).to_dict())

            total_alertas += count
            monto_comprometido += monto
            por_severidad[severidad] = por_severidad.get(severidad, 0) + count

        # Global risk score (0-100)
        weighted = sum(
            por_severidad.get(sev, 0) * w
            for sev, w in SEVERIDAD_WEIGHT.items()
        )
        # Normalize: 0 alerts = 0, 100+ weighted alerts = 100
        score_global = min(100, round(weighted / max(1, len(self.df_f)) * 1000, 0))

        if score_global >= 60:
            nivel = "ALTO"
        elif score_global >= 30:
            nivel = "MEDIO"
        else:
            nivel = "BAJO"

        return {
            "score_global": int(score_global),
            "nivel_riesgo": nivel,
            "resumen": {
                "total_alertas": total_alertas,
                "monto_comprometido": round(monto_comprometido, 2),
                "por_severidad": por_severidad,
            },
            "categorias": categorias,
        }


def build_sat_risk_engine(db_engine) -> Optional[SATRiskEngine]:
    """Factory: create SATRiskEngine from the DataEngine singleton."""
    df_f = getattr(db_engine, "df_facturas", pd.DataFrame())
    df_c = getattr(db_engine, "df_conceptos", pd.DataFrame())
    df_comp = getattr(db_engine, "df_complementos", pd.DataFrame())

    if df_f.empty:
        return None
    return SATRiskEngine(df_f, df_c, df_comp)
