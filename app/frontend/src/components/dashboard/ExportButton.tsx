import React from 'react';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ExportButtonProps {
  data: any[];
  filename?: string;
  label?: string;
  className?: string;
  onExport?: () => Promise<any[]>;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ 
  data, 
  filename = 'export', 
  label = 'Exportar Excel',
  className = '',
  onExport
}) => {
  const [isExporting, setIsExporting] = React.useState(false);
  
  const handleExport = async () => {
    try {
      setIsExporting(true);
      
      let exportData = data;
      if (onExport) {
        exportData = await onExport();
      }

      if (!exportData || exportData.length === 0) {
        alert("No hay datos para exportar");
        return;
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // Auto-width columns roughly
      const firstRow = exportData[0];
      if (firstRow) {
         const colWidths = Object.keys(firstRow).map(key => {
           return { wch: Math.max(key.length, 15) }; 
         });
         ws['!cols'] = colWidths;
      }

      XLSX.utils.book_append_sheet(wb, ws, "Datos");
      
      const fullFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
      XLSX.writeFile(wb, fullFilename);
    } catch (error) {
      console.error("Error exporting data:", error);
      alert("Error al exportar los datos.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className={`flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors ${className}`}
      title="Descargar datos en Excel"
    >
      <Download size={16} className={isExporting ? "animate-pulse" : ""} />
      {isExporting ? "Exportando..." : label}
    </button>
  );
};

