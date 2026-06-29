import pandas as pd
import numpy as np

class PriceAuditor:
    def __init__(self, df_conceptos):
        self.df = df_conceptos.copy()

    def detect_overpricing(self, threshold_multiplier=3.0, min_price=50.0):
        """
        Detects unit prices that are significantly higher than the median for the same product/service.
        
        Args:
            threshold_multiplier: How many times the median price triggers an alert (default 3x).
            min_price: Minimum price to consider analyzing (ignore low value items to reduce noise).
        """
        if self.df.empty:
            return []

        # Ensure numeric columns
        cols_to_numeric = ['CLAVE PROD/SERV', 'VALOR UNITARIO', 'IMPORTE', 'CANTIDAD']
        for col in cols_to_numeric:
            if col in self.df.columns:
                self.df[col] = pd.to_numeric(self.df[col], errors='coerce').fillna(0)

        # Create a unique key for grouping: Product Code + Unit
        # We handle missing units by filling with 'N/A'
        if 'UNIDAD' not in self.df.columns:
            self.df['UNIDAD'] = 'N/A'
        
        self.df['UNIDAD'] = self.df['UNIDAD'].fillna('N/A').astype(str)
        self.df['GROUP_KEY'] = self.df['CLAVE PROD/SERV'].astype(str) + "|" + self.df['UNIDAD']

        # Calculate Median Unit Price per Group
        # Filter out zero prices and returns (negative values) for the baseline calculation
        valid_prices = self.df[self.df['VALOR UNITARIO'] > 0]
        
        stats = valid_prices.groupby('GROUP_KEY')['VALOR UNITARIO'].agg(['median', 'count', 'std']).reset_index()
        stats.columns = ['GROUP_KEY', 'MEDIAN_PRICE', 'TX_COUNT', 'STD_DEV']

        # Merge stats back to the main dataframe
        merged = pd.merge(self.df, stats, on='GROUP_KEY', how='left')

        # Filter for candidates
        # 1. Price is positive
        # 2. Group has at least 2 transactions (cannot compare if it's unique)
        # 3. Price is above minimum threshold
        candidates = merged[
            (merged['VALOR UNITARIO'] > min_price) & 
            (merged['TX_COUNT'] > 1) &
            (merged['MEDIAN_PRICE'] > 0)
        ].copy()

        if candidates.empty:
            return []

        # Calculate deviation
        candidates['DEVIATION_RATIO'] = candidates['VALOR UNITARIO'] / candidates['MEDIAN_PRICE']
        candidates['MARKUP_PCT'] = ((candidates['VALOR UNITARIO'] - candidates['MEDIAN_PRICE']) / candidates['MEDIAN_PRICE']) * 100

        # Apply logic: Flag if Unit Price > Median * Threshold
        outliers = candidates[candidates['DEVIATION_RATIO'] >= threshold_multiplier].copy()

        # Sort by most egregious overpricing (highest markup %)
        outliers = outliers.sort_values('MARKUP_PCT', ascending=False)

        results = []
        for _, row in outliers.iterrows():
            results.append({
                "uuid": row.get('UUID', 'N/A'),
                "fecha": str(row.get('FECHA', 'N/A')),
                "empresa_emisora": row.get('EMPRESA', 'N/A'),
                "cliente": row.get('CLIENTE', 'N/A'),
                "producto_clave": row.get('CLAVE PROD/SERV', 'N/A'),
                "descripcion_sat": row.get('DESCRIPCION SAT', row.get('DESCRIPCION', 'N/A')),
                "descripcion_mano": row.get('DESCRIPCION', 'N/A'),
                "unidad": row.get('UNIDAD', 'N/A'),
                "precio_unitario": float(row['VALOR UNITARIO']),
                "precio_mediana_mercado": float(row['MEDIAN_PRICE']),
                "sobreprecio_detectado": f"{float(row['MARKUP_PCT']):.1f}%",
                "multiplo_desviacion": float(row['DEVIATION_RATIO']),
                "riesgo": "ALTO - POSIBLE OPERACIÓN SIMULADA"
            })

        return results

    def get_summary_stats(self):
        """Returns high-level stats about pricing consistency."""
        if self.df.empty:
            return {}
        
        # ... implementation for summary stats if needed ...
        return {}
