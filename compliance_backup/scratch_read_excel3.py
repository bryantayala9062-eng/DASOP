import sys
import openpyxl

sys.stdout.reconfigure(encoding='utf-8')
file_path = r'c:\Users\Administrador\Desktop\DashOP\compliance\backend\uploads\kpis\3236a08822a84da1bcf794a765f5fb23.xlsx'
wb = openpyxl.load_workbook(file_path, data_only=True)
ws = wb.worksheets[0]
print("First sheet name:", ws.title)
for row in ws.iter_rows(values_only=True):
    if any(cell is not None for cell in row):
        print(row)
