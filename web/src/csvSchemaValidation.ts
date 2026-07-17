/** Normalize a CSV basename for table matching (strips .chunkN suffix). */
export function csvBaseName(fileName: string): string {
  const withoutExt = fileName.replace(/\.csv$/i, '');
  return withoutExt.replace(/\.chunk\d+$/i, '').toLowerCase();
}

/** Warnings when picked CSV names do not align with SQL table names from the DDL model. */
export function csvTableMatchWarnings(csvFileNames: string[], expectedTableNames: string[]): string[] {
  if (csvFileNames.length === 0 || expectedTableNames.length === 0) return [];

  const expected = new Set(expectedTableNames.map((name) => name.toLowerCase()));
  const matched = csvFileNames.filter((fileName) => expected.has(csvBaseName(fileName)));
  const unmatched = csvFileNames.filter((fileName) => !expected.has(csvBaseName(fileName)));

  const warnings: string[] = [];
  if (matched.length === 0) {
    const sample = expectedTableNames.slice(0, 5).map((table) => `${table}.csv`).join(', ');
    warnings.push(
      `No CSV files match your SQL schema tables. Found: ${csvFileNames.join(', ')}. ` +
        `Expected one CSV per table (e.g. ${sample}${expectedTableNames.length > 5 ? ', …' : ''}). ` +
        'Atlas cluster exports and other non-table CSVs cannot be used here.',
    );
    return warnings;
  }

  if (unmatched.length > 0) {
    const listed = unmatched.slice(0, 6).join(', ');
    warnings.push(
      `${unmatched.length} CSV file(s) do not match any SQL table: ${listed}${unmatched.length > 6 ? '…' : ''}.`,
    );
  }

  return warnings;
}

/** First fatal schema mismatch message, if any. */
export function fatalCsvSchemaMismatch(csvFileNames: string[], expectedTableNames: string[]): string | null {
  const warnings = csvTableMatchWarnings(csvFileNames, expectedTableNames);
  return warnings.find((warning) => warning.startsWith('No CSV files match')) ?? null;
}
