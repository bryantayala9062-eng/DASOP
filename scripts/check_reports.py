import sqlite3
import pandas as pd

conn = sqlite3.connect(r'c:\Users\Administrador\Desktop\DashOP\compliance\backend\complianceop.db')

print("--- Department Reports ---")
df = pd.read_sql_query("SELECT * FROM department_reports", conn)
print(df)

print("--- KPI Evaluations ---")
df2 = pd.read_sql_query("SELECT * FROM kpi_evaluations", conn)
print(df2)

print("--- Evidences ---")
df3 = pd.read_sql_query("SELECT id, title, file_name, category, report_id, kpi_eval_id FROM evidences", conn)
print(df3)

print("--- Document Audit Log ---")
df4 = pd.read_sql_query("SELECT action, file_name, created_at, user_id FROM document_audit_log ORDER BY created_at DESC LIMIT 10", conn)
print(df4)

conn.close()
