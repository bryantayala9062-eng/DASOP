import re
from datetime import datetime, timedelta
import calendar
import unicodedata

def remove_accents(input_str):
    nfkd_form = unicodedata.normalize('NFKD', input_str)
    return u"".join([c for c in nfkd_form if not unicodedata.combining(c)])


class NLPEngine:
    def __init__(self, data_engine):
        self.data_engine = data_engine

    def parse_query(self, query: str) -> dict:
        original_q = query
        q = remove_accents(query.lower().strip())

        result = {
            "status": "ALL",
            "cliente": "",
            "empresa": "",
            "startDate": "",
            "endDate": "",
            "folio": "",
            # ── Steroids extras ──
            "rfc": "",
            "monto_min": None,
            "monto_max": None,
            "interpreted_as": "",   # Explicación legible de lo que entendió
        }

        interpretaciones = []

        # ============================================================
        # 1. STATUS  (ampliado con muchos sinónimos)
        # ============================================================
        pendiente_pat = r'\b(pendient|debe|deuda|debida|pagar|adeuda|vencid|sin\s+cobrar|no\s+pagad|por\s+cobrar|sin\s+pagar|por\s+pagar|no\s+cobrad)\w*'
        pagado_pat    = r'\b(pagad|cobrad|liquidad|saldad|finiquitad|cancelad)\w*'
        parcial_pat   = r'\b(parcial|abono|abonado|pago\s+parcial)\w*'

        if re.search(pendiente_pat, q):
            result["status"] = "PENDIENTE"
            q = re.sub(pendiente_pat, '', q)
            interpretaciones.append("Estado: Pendiente")
        elif re.search(pagado_pat, q):
            result["status"] = "PAGADO"
            q = re.sub(pagado_pat, '', q)
            interpretaciones.append("Estado: Pagado")
        elif re.search(parcial_pat, q):
            result["status"] = "PARCIAL"
            q = re.sub(parcial_pat, '', q)
            interpretaciones.append("Estado: Parcial")

        # ============================================================
        # 2. FOLIO  (Steroid: detectar folios explícitos)
        # ============================================================
        folio_match = re.search(
            r'\b(?:folio|factura|cfdi|serie)[\s:]+([a-z0-9][-a-z0-9/]{0,30})',
            q
        )
        if folio_match:
            result["folio"] = folio_match.group(1).strip().upper()
            q = q[:folio_match.start()] + q[folio_match.end():]
            interpretaciones.append(f"Folio: {result['folio']}")
        else:
            # Detectar folio con formato típico aunque no venga la palabra "folio"
            standalone_folio = re.search(r'\b([a-z]{1,3}[-/]?\d{3,8})\b', q)
            if standalone_folio:
                result["folio"] = standalone_folio.group(1).upper()
                q = q[:standalone_folio.start()] + q[standalone_folio.end():]
                interpretaciones.append(f"Folio detectado: {result['folio']}")

        # ============================================================
        # 3. RFC  (Steroid: extraer RFC de 12-13 caracteres alfanuméricos)
        # ============================================================
        rfc_match = re.search(
            r'\b(?:rfc[\s:]*)?([a-z&ñ]{3,4}\d{6}[a-z0-9]{3})\b',
            q
        )
        if rfc_match:
            result["rfc"] = rfc_match.group(1).upper()
            q = q[:rfc_match.start()] + q[rfc_match.end():]
            interpretaciones.append(f"RFC: {result['rfc']}")

        # ============================================================
        # 4. MONTOS  (Steroid: mayor a X / menor a X / entre X y Y)
        # ============================================================
        def parse_amount(s: str) -> float | None:
            """Convierte strings como '50,000', '10 mil', '1.5 millones' a float."""
            s = s.replace(',', '').strip()
            mult = 1.0
            if re.search(r'\bmillon\w*', s):
                mult = 1_000_000
                s = re.sub(r'\bmillon\w*', '', s)
            elif re.search(r'\bmil\b', s):
                mult = 1_000
                s = re.sub(r'\bmil\b', '', s)
            s = s.strip()
            try:
                return float(s) * mult
            except ValueError:
                return None

        # "mayor(es) a / por encima de / más de X"
        mayor_match = re.search(
            r'(?:mayor(?:es)?\s+(?:a|de)|por\s+encima\s+de|mas\s+de|superior(?:es)?\s+(?:a|de))\s+([\d,\.]+(?:\s*(?:mil|millon\w*))?)',
            q
        )
        if mayor_match:
            val = parse_amount(mayor_match.group(1))
            if val is not None:
                result["monto_min"] = val
                q = q[:mayor_match.start()] + q[mayor_match.end():]
                interpretaciones.append(f"Monto mínimo: ${val:,.0f}")

        # "menor(es) a / por debajo de / menos de X"
        menor_match = re.search(
            r'(?:menor(?:es)?\s+(?:a|de)|por\s+debajo\s+de|menos\s+de|inferior(?:es)?\s+(?:a|de))\s+([\d,\.]+(?:\s*(?:mil|millon\w*))?)',
            q
        )
        if menor_match:
            val = parse_amount(menor_match.group(1))
            if val is not None:
                result["monto_max"] = val
                q = q[:menor_match.start()] + q[menor_match.end():]
                interpretaciones.append(f"Monto máximo: ${val:,.0f}")

        # "entre X y Y"
        entre_match = re.search(
            r'entre\s+([\d,\.]+(?:\s*(?:mil|millon\w*))?)\s+y\s+([\d,\.]+(?:\s*(?:mil|millon\w*))?)',
            q
        )
        if entre_match:
            val_min = parse_amount(entre_match.group(1))
            val_max = parse_amount(entre_match.group(2))
            if val_min is not None:
                result["monto_min"] = val_min
            if val_max is not None:
                result["monto_max"] = val_max
            q = q[:entre_match.start()] + q[entre_match.end():]
            if val_min and val_max:
                interpretaciones.append(f"Monto entre ${val_min:,.0f} y ${val_max:,.0f}")

        # ============================================================
        # 5. FECHAS
        # ============================================================
        now = datetime.now()
        y = now.year
        m = now.month

        fecha_encontrada = False

        # ── Trimestres  (Steroid) ──
        trimestre_map = {
            r'\b(?:primer\s+trimestre|q1|t1)\b': (1, 3),
            r'\b(?:segundo\s+trimestre|q2|t2)\b': (4, 6),
            r'\b(?:tercer\s+trimestre|q3|t3)\b': (7, 9),
            r'\b(?:cuarto\s+trimestre|q4|t4)\b': (10, 12),
        }

        # Año explícito presente en la consulta (para trimestres y meses)
        año_explicito_match = re.search(r'\b(20\d{2})\b', q)
        año_explicito = int(año_explicito_match.group(1)) if año_explicito_match else None
        if año_explicito:
            q = q.replace(año_explicito_match.group(1), '')

        for pat, (mes_ini, mes_fin) in trimestre_map.items():
            if re.search(pat, q):
                ty = año_explicito if año_explicito else y
                _, last_d = calendar.monthrange(ty, mes_fin)
                result["startDate"] = f"{ty}-{mes_ini:02d}-01"
                result["endDate"]   = f"{ty}-{mes_fin:02d}-{last_d:02d}"
                q = re.sub(pat, '', q)
                trim_nombre = {(1,3):"Q1",(4,6):"Q2",(7,9):"Q3",(10,12):"Q4"}[(mes_ini,mes_fin)]
                interpretaciones.append(f"Período: {trim_nombre} {ty}")
                fecha_encontrada = True
                break

        # ── Mes por nombre  ──
        # IMPORTANTE: se detecta ANTES del fallback año-completo para que
        # "enero 2026" resuelva al mes correcto y no quede como cliente.
        meses = {
            "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
            "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
            "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12
        }
        if not fecha_encontrada:
            for nombre_mes, num_mes in meses.items():
                if re.search(fr'\b{nombre_mes}\b', q):
                    py = año_explicito if año_explicito else (y - 1 if num_mes > m else y)
                    if "del ano pasado" in original_q.lower() or "ano pasado" in original_q.lower():
                        py = y - 1
                    _, last_d = calendar.monthrange(py, num_mes)
                    result["startDate"] = f"{py}-{num_mes:02d}-01"
                    result["endDate"]   = f"{py}-{num_mes:02d}-{last_d:02d}"
                    q = re.sub(fr'\b{nombre_mes}\b', '', q)   # consumir el mes del string
                    interpretaciones.append(f"Mes: {nombre_mes.capitalize()} {py}")
                    fecha_encontrada = True
                    break

        if not fecha_encontrada:
            # ── Año completo explícito  (Steroid) ──
            if año_explicito:
                result["startDate"] = f"{año_explicito}-01-01"
                result["endDate"]   = f"{año_explicito}-12-31"
                interpretaciones.append(f"Año: {año_explicito}")
                fecha_encontrada = True

        if not fecha_encontrada:
            # ── Relativos: año ──
            if "ano pasado" in q or "año pasado" in q:
                result["startDate"] = f"{y-1}-01-01"
                result["endDate"]   = f"{y-1}-12-31"
                q = re.sub(r'a[ñn]o\s+pasado', '', q)
                interpretaciones.append(f"Año pasado ({y-1})")
                fecha_encontrada = True
            elif re.search(r'\beste\s+a[ñn]o\b', q):
                result["startDate"] = f"{y}-01-01"
                result["endDate"]   = f"{y}-12-31"
                q = re.sub(r'este\s+a[ñn]o', '', q)
                interpretaciones.append(f"Este año ({y})")
                fecha_encontrada = True

        if not fecha_encontrada:
            # ── Relativos: mes ──
            if "mes pasado" in q:
                pm = 12 if m == 1 else m - 1
                py = y - 1 if m == 1 else y
                _, last_d = calendar.monthrange(py, pm)
                result["startDate"] = f"{py}-{pm:02d}-01"
                result["endDate"]   = f"{py}-{pm:02d}-{last_d:02d}"
                q = q.replace("mes pasado", "")
                interpretaciones.append("Mes pasado")
                fecha_encontrada = True
            elif "este mes" in q:
                _, last_d = calendar.monthrange(y, m)
                result["startDate"] = f"{y}-{m:02d}-01"
                result["endDate"]   = f"{y}-{m:02d}-{last_d:02d}"
                q = q.replace("este mes", "")
                interpretaciones.append("Este mes")
                fecha_encontrada = True

        if not fecha_encontrada:
            # ── Relativos: día ──
            if "ayer" in q:
                ayer = now - timedelta(days=1)
                result["startDate"] = ayer.strftime("%Y-%m-%d")
                result["endDate"]   = ayer.strftime("%Y-%m-%d")
                q = q.replace("ayer", "")
                interpretaciones.append("Ayer")
                fecha_encontrada = True
            elif "hoy" in q:
                result["startDate"] = now.strftime("%Y-%m-%d")
                result["endDate"]   = now.strftime("%Y-%m-%d")
                q = q.replace("hoy", "")
                interpretaciones.append("Hoy")
                fecha_encontrada = True

        if not fecha_encontrada:
            # ── Últimos N días ──
            ultimos_match = re.search(r'\b(?:ultimos?|ultimas?)\s+(\d+)\s+(?:dias?|semanas?)', q)
            if ultimos_match:
                n = int(ultimos_match.group(1))
                unit = ultimos_match.group(0)
                if "semana" in unit:
                    n = n * 7
                desde = now - timedelta(days=n)
                result["startDate"] = desde.strftime("%Y-%m-%d")
                result["endDate"]   = now.strftime("%Y-%m-%d")
                q = q[:ultimos_match.start()] + q[ultimos_match.end():]
                interpretaciones.append(f"Últimos {ultimos_match.group(1)} días")
                fecha_encontrada = True



        # ============================================================
        # 6. ENTIDADES (Empresa / Cliente / RFC)
        # ============================================================
        stop_words = [
            "de", "la", "el", "al", "los", "las", "del", "factura", "facturas",
            "busc", "quier", "muestrame", "dime", "con", "en", "para", "que",
            "son", "cuales", "cuantas", "cuantos", "dame", "ver", "muestra",
            "todas", "todos", "hay", "tengo", "tenemos", "cliente", "clientes",
            "empresa", "empresas", "rfc",
            # Meses como red de seguridad (ya deberían haberse consumido arriba)
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
        ]
        for sw in stop_words:
            q = re.sub(fr'\b{sw}\b', ' ', q)

        leftover = " ".join(q.split()).strip().upper()

        if leftover:
            empresas_unicas = []
            if hasattr(self.data_engine, 'df_facturas') and not self.data_engine.df_facturas.empty:
                empresas_unicas = self.data_engine.df_facturas['EMPRESA'].dropna().unique().tolist()

            matched_empresa = False
            for emp in empresas_unicas:
                if leftover in str(emp).upper():
                    result["empresa"] = str(emp)
                    matched_empresa = True
                    interpretaciones.append(f"Empresa: {emp}")
                    break

            if not matched_empresa:
                result["cliente"] = leftover
                interpretaciones.append(f"Cliente: {leftover}")

        # ============================================================
        # 7. MENSAJE DE INTERPRETACIÓN  (Steroid: explicación amigable)
        # ============================================================
        if interpretaciones:
            result["interpreted_as"] = " | ".join(interpretaciones)
        else:
            result["interpreted_as"] = "No se detectaron filtros específicos — mostrando todo."

        return result
