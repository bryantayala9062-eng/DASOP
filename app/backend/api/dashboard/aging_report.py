from typing import List, Dict

BUCKETS = [
    (0, 30, '0-30 días'),
    (31, 60, '31-60 días'),
    (61, 90, '61-90 días'),
    (91, None, '90+ días'),
]


class AgingReport:
    def __init__(self, df_facturas):
        self.df = df_facturas.copy()

    def build(self) -> List[Dict]:
        if self.df.empty:
            return []
        df = self.df[self.df['SALDO PENDIENTE'] > 0].copy()
        if df.empty:
            return []

        report = []
        now = df['FECHA'].max()
        df['days_open'] = (now - df['FECHA']).dt.days

        for start, end, label in BUCKETS:
            subset = df[(df['days_open'] >= start) & ((df['days_open'] <= end) if end else True)]
            report.append({
                'bucket': label,
                'saldo': float(subset['SALDO PENDIENTE'].sum()),
                'facturas': int(subset['UUID'].nunique()),
                'clientes': int(subset['CLIENTE'].nunique()),
            })
        return report
