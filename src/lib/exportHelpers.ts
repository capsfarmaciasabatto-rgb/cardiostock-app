/**
 * Utility functions for exporting data to CSV / Excel compatible format and PDF
 */

export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  // Add UTF-8 BOM for Excel to properly handle accents and special characters (e.g. ñ, á, é, í, ó, ú)
  const BOM = "\uFEFF";
  
  const escapeCSV = (value: string | number | undefined | null) => {
    if (value === undefined || value === null) return '""';
    const str = String(value).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvContent = [
    headers.map(escapeCSV).join(';'), // Semicolon is the standard delimiter for Excel in Spanish locales
    ...rows.map(row => row.map(escapeCSV).join(';'))
  ].join('\r\n');

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
