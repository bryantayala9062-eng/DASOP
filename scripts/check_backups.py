import os
import datetime

def check_dir(path):
    if not os.path.exists(path):
        print(f"Directory does not exist: {path}")
        return
    
    files = []
    for root, dirs, filenames in os.walk(path):
        for f in filenames:
            files.append(os.path.join(root, f))
            
    if not files:
        print(f"Directory is empty: {path}")
        return
        
    latest_file = max(files, key=os.path.getmtime)
    mtime = os.path.getmtime(latest_file)
    print(f"Latest file in {path} is {latest_file}")
    print(f"Last modified: {datetime.datetime.fromtimestamp(mtime)}")

print("Checking Backup Directories...")
check_dir(r"C:\Users\Administrador\Desktop\Respaldo_Compliance_Actual")
check_dir(r"C:\Users\Administrador\Desktop\Respaldo_ERP_Actual")
