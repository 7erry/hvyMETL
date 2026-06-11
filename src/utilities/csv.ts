/**
 * Minimal, dependency-free CSV reading and writing helpers.
 *
 * The ETL writes CSV files chunk-by-chunk and the import CLI reads them back,
 * so both sides share these functions to guarantee the dialect matches
 * (RFC 4180: comma separated, double-quote escaping, \n row endings).
 */

/**
 * Escape one cell value for CSV output.
 * Wraps the value in double quotes when it contains a comma, quote, or
 * newline, and doubles any embedded quotes ("" is an escaped quote).
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/** Format an array of cell values as one CSV line (without the newline). */
export function formatCsvRow(values: unknown[]): string {
  return values.map(escapeCsvValue).join(',');
}

/**
 * Parse a complete CSV string into rows of string cells.
 *
 * Handles quoted cells containing commas, newlines, and escaped quotes.
 * Empty cells come back as empty strings; the caller decides how to coerce
 * them (the import CLI turns them into null).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let isInsideQuotes = false;
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (isInsideQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          // Doubled quote inside a quoted cell means a literal quote.
          currentCell += '"';
          index += 2;
          continue;
        }
        isInsideQuotes = false;
        index += 1;
        continue;
      }
      currentCell += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      isInsideQuotes = true;
      index += 1;
      continue;
    }
    if (char === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      index += 1;
      continue;
    }
    if (char === '\n' || char === '\r') {
      // Treat \r\n as a single row ending.
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      index += 1;
      continue;
    }
    currentCell += char;
    index += 1;
  }

  // Flush the final cell/row when the file does not end with a newline.
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  // Drop fully empty trailing rows (a file ending in "\n" produces one).
  return rows.filter((row) => row.length > 1 || row[0] !== '');
}
