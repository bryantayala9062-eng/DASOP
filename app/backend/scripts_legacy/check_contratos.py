import sqlite3

conn = sqlite3.connect('portal_erp.db')
c = conn.cursor()

# Conteo por estatus
c.execute("SELECT estatus, count(*) FROM contratos GROUP BY estatus ORDER BY count(*) DESC")
print("=== CONTRATOS POR ESTATUS ===")
for row in c.fetchall():
    print(f"  {row[0]}: {row[1]}")

# Cuantos tienen empresa rellena
c.execute("SELECT count(*) FROM contratos WHERE empresa IS NOT NULL AND empresa != ''")
print(f"\n=== Con empresa (texto): {c.fetchone()[0]} ===")

# Cuantos tienen empresa_id vinculado
c.execute("SELECT count(*) FROM contratos WHERE empresa_id IS NOT NULL")
print(f"=== Con empresa_id (vinculado): {c.fetchone()[0]} ===")

# Cuantos son finalizados
c.execute("SELECT count(*) FROM contratos WHERE estatus = '8_FINALIZADO'")
print(f"=== Finalizados: {c.fetchone()[0]} ===")

# Cuantos NO son finalizado ni redaccion
c.execute("SELECT estatus, count(*) FROM contratos WHERE estatus != '1_REDACCION_LEGAL' AND estatus != '8_FINALIZADO' GROUP BY estatus")
print("\n=== En proceso (no redaccion ni finalizado) ===")
for row in c.fetchall():
    print(f"  {row[0]}: {row[1]}")
