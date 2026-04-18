import * as XLSX from 'xlsx';

/**
 * Export data to an Excel file with timestamp in filename.
 * @param {Object[]} data - Array of row objects
 * @param {Object[]} columns - Array of { header: string, key: string, width?: number }
 * @param {string} sheetName - Name of the worksheet
 * @param {string} filePrefix - Prefix for the filename (e.g. "Loans")
 */
export function exportToExcel(data, columns, sheetName, filePrefix) {
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;

  const headers = columns.map(c => c.header);
  const rows = data.map(row => columns.map(c => row[c.key] ?? ''));

  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = columns.map(c => ({ wch: c.width || 15 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filePrefix}_${timestamp}.xlsx`);
}

/**
 * Export multiple sheets to a single Excel file.
 * @param {Object[]} sheets - Array of { data, columns, sheetName }
 * @param {string} filePrefix - Prefix for the filename
 */
export function exportMultiSheetExcel(sheets, filePrefix) {
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;

  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const headers = sheet.columns.map(c => c.header);
    const rows = sheet.data.map(row => sheet.columns.map(c => row[c.key] ?? ''));
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = sheet.columns.map(c => ({ wch: c.width || 15 }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName);
  }

  XLSX.writeFile(wb, `${filePrefix}_${timestamp}.xlsx`);
}
