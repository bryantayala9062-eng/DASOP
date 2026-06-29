import os
import xml.etree.ElementTree as ET
import pandas as pd

def main():
    xml_dir = r'C:\Users\Administrador\Desktop\Procesador-XML_LIMPIO\Archivos XML'
    out_file = r'C:\Users\Administrador\Desktop\DashOP\Emisoras_Extraidas.xlsx'
    
    # Namespaces for parsing CFDI XMLs
    NAMESPACES = {
        'cfdi': 'http://www.sat.gob.mx/cfd/4',
        'cfdi33': 'http://www.sat.gob.mx/cfd/3'
    }

    emisoras = set()
    print(f"Buscando archivos XML en: {xml_dir}")

    total_files = 0
    parsed_files = 0

    if not os.path.exists(xml_dir):
        print("El directorio de XMLs no existe.")
        return

    for root, dirs, files in os.walk(xml_dir):
        for f in files:
            if f.lower().endswith('.xml'):
                total_files += 1
                path = os.path.join(root, f)
                try:
                    tree = ET.parse(path)
                    xml_root = tree.getroot()
                    
                    # Try to find Emisor tag (works for both cfdi 3.3 and 4.0 if using generic local name or both namespaces)
                    emisor = xml_root.find('cfdi:Emisor', NAMESPACES)
                    if emisor is None:
                        emisor = xml_root.find('cfdi33:Emisor', NAMESPACES)
                        
                    if emisor is not None:
                        nombre = emisor.get('Nombre', '').strip()
                        rfc = emisor.get('Rfc', '').strip()
                        if nombre and rfc:
                            emisoras.add((rfc, nombre))
                            parsed_files += 1
                except Exception as e:
                    # Ignore malformed XMLs
                    pass

    print(f"Archivos escaneados: {total_files}")
    print(f"Archivos parseados exitosamente: {parsed_files}")
    
    if emisoras:
        df = pd.DataFrame(list(emisoras), columns=['RFC', 'Razon_Social'])
        df = df.sort_values(by='Razon_Social')
        df.to_excel(out_file, index=False)
        print(f"\n¡Éxito! Se encontraron {len(df)} emisoras únicas.")
        print(f"El archivo Excel ha sido guardado en:\n{out_file}")
    else:
        print("No se encontraron emisoras válidas en los XMLs.")

if __name__ == "__main__":
    main()
