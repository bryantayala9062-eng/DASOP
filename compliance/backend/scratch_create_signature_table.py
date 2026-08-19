import os
import sys

# Ensure backend directory is in the path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.database import engine, Base
from models.all_models import ElectronicSignature

def main():
    print("Creating ElectronicSignature table...")
    # This will create any missing tables, but won't drop existing ones or alter schemas of existing ones
    ElectronicSignature.__table__.create(bind=engine, checkfirst=True)
    print("Table created successfully!")

if __name__ == "__main__":
    main()
