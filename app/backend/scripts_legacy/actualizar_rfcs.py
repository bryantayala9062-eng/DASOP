import sqlite3
import pdfplumber
import re
import os

conn = sqlite3.connect('portal_erp.db')
c = conn.cursor()

# RFC pattern: 3-4 letras + 6 digitos + 3 homonimia
rfc_pattern = re.compile(r'\b([A-Z&]{3,4})(\d{6})([A-Z0-9]{3})\b')

# Empresas con RFC falso que tienen OP o CSF
c.execute("""
    SELECT DISTINCT e.id, e.razon_social, e.rfc
    FROM documentos_materialidad d
    JOIN empresas e ON d.empresa_id = e.id
    WHERE d.tipo_documento IN ('OPINION_CUMPLIMIENTO', 'CONSTANCIA_SITUACION')
    AND e.rfc LIKE 'XAXX%'
""")
empresas = c.fetchall()
print(f"Empresas con RFC falso que tienen OP/CSF: {len(empresas)}")

actualizadas = 0
sin_rfc = []

for emp_id, razon, rfc_actual in empresas:
    # Buscar documentos OP o CSF de esta empresa
    c.execute("""
        SELECT ruta_fisica FROM documentos_materialidad
        WHERE empresa_id = ? AND tipo_documento IN ('OPINION_CUMPLIMIENTO', 'CONSTANCIA_SITUACION')
        LIMIT 3
    """, (emp_id,))
    docs = c.fetchall()
    
    rfc_encontrado = None
    for (ruta,) in docs:
        ruta_completa = ruta if os.path.isabs(ruta) else os.path.join("archivos_fisicos", os.path.basename(ruta))
        if not os.path.exists(ruta_completa):
            # intentar la ruta tal cual
            ruta_completa = ruta
        if not os.path.exists(ruta_completa):
            continue
        
        try:
            with pdfplumber.open(ruta_completa) as pdf:
                texto = ""
                for page in pdf.pages[:3]:  # solo primeras 3 paginas
                    t = page.extract_text()
                    if t:
                        texto += t
            
            matches = rfc_pattern.findall(texto)
            rfcs = ["".join(m) for m in matches]
            
            # El RFC de la empresa no es el del SAT (que es XAXX000000000)
            rfcs_validos = [r for r in rfcs if not r.startswith("XAXX") and r != "XAX0000000000"]
            
            if rfcs_validos:
                rfc_encontrado = rfcs_validos[0]
                break
        except Exception as e:
            print(f"  Error en {ruta_completa}: {e}")
            continue
    
    if rfc_encontrado:
        try:
            c.execute("UPDATE empresas SET rfc = ? WHERE id = ?", (rfc_encontrado, emp_id))
            print(f"  OK {razon}: {rfc_actual} -> {rfc_encontrado}")
            actualizadas += 1
        except Exception as e:
            print(f"  SKIP {razon}: RFC {rfc_encontrado} ya existe ({e})")
            sin_rfc.append(f"{razon} (duplicado)")
    else:
        sin_rfc.append(razon)

conn.commit()
print(f"\n=== RESUMEN ===")
print(f"  Actualizadas: {actualizadas}")
print(f"  Sin RFC encontrado ({len(sin_rfc)}): {sin_rfc[:10]}")
