import sqlite3
conn = sqlite3.connect('portal_erp.db')
c = conn.cursor()

# Ver los archivos de OP SAT y CSF, que suelen tener RFC en el nombre
c.execute("""
    SELECT e.id, e.razon_social, e.rfc, d.tipo_documento, d.ruta_fisica
    FROM documentos_materialidad d
    JOIN empresas e ON d.empresa_id = e.id
    WHERE d.tipo_documento IN ('OPINION_CUMPLIMIENTO', 'CONSTANCIA_SITUACION')
    AND e.rfc LIKE 'XAXX%'
    LIMIT 20
""")
for row in c.fetchall():
    print(row)
