import React from 'react';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ExportButtonProps {
  data: any[];
  filename?: string;
  label?: string;
  className?: string;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ 
  data, 
  filename = 'export', 
  label = 'Exportar Excel',
  className = ''
}) => {
  
  const handleExport = () => {
    if (!data || data.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Auto-width columns roughly
    const firstRow = data[0];
    if (firstRow) {
       const colWidths = Object.keys(firstRow).map(key => {
         // rough estimation: length of key vs length of value
         return { wch: Math.max(key.length, 15) }; 
       });
       ws['!cols'] = colWidths;
    }

    XLSX.utils.book_append_sheet(wb, ws, "Datos");
    
    const fullFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    XLSX.writeFile(wb, fullFilename);
  };

  return (
    <button
      onClick={handleExport}
      className={`flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors ${className}`}
      title="Descargar datos en Excel"
    >
      <Download size={16} />
      {label}
    </button>
  );
};
