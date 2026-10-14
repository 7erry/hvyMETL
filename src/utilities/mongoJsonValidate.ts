/**
 * String checks for MongoDB document paste. This module must not import
 * `mongodb` — the studio bundles anything `detectDialect` reaches.
 */

/** True when pasted text is documents, not JSON Schema or a structural-model export. */
export function looksLikeMongoJsonImport(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/"tables"\s*:/.test(trimmed) && /"columns"\s*:/.test(trimmed)) return false;
  if (/"\$schema"\s*:/.test(trimmed) || /"\$defs"\s*:/.test(trimmed) || /"definitions"\s*:/.test(trimmed)) {
    return false;
  }
  if (/"properties"\s*:/.test(trimmed) && /"type"\s*:\s*"object"/.test(trimmed)) return false;
  if (/"\$oid"|"\$date"|"\$numberLong"|"\$numberDecimal"|"\$numberInt"|"\$numberDouble"/.test(trimmed)) {
    return true;
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (trimmed.startsWith('[')) {
    const next = trimmed.slice(1).trimStart();
    return next.startsWith('{') || next.startsWith(']');
  }
  if (lines.length > 1 && lines.filter((line) => line.startsWith('{')).length >= 2) return true;
  if (lines.length === 1 && lines[0]?.startsWith('{') && /"_id"\s*:/.test(trimmed)) return true;
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

/**
 * First-line and Extended JSON wrapper check for the import textarea.
 * Returns a message when the paste cannot be documents, or null when it is empty or fine.
 */
export function validateMongoJsonPaste(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\r?\n/).find((line) => line.trim());
  if (!first || !/^[\[{]/.test(first.trim())) {
    return 'First line must be a JSON object or array.';
  }

  const oid = trimmed.match(/"\$oid"\s*:\s*"([^"]*)"/);
  if (oid && !/^[a-fA-F0-9]{24}$/.test(oid[1] ?? '')) {
    return 'Extended JSON $oid must be 24 hex characters.';
  }

  const longValue = trimmed.match(/"\$numberLong"\s*:\s*"([^"]*)"/);
  if (longValue && !/^-?\d+$/.test(longValue[1] ?? '')) {
    return 'Extended JSON $numberLong must be a decimal integer string.';
  }

  const decimal = trimmed.match(/"\$numberDecimal"\s*:\s*"([^"]*)"/);
  if (decimal && !/^-?\d+(\.\d+)?$/.test(decimal[1] ?? '')) {
    return 'Extended JSON $numberDecimal must be a decimal string.';
  }

  const date = trimmed.match(/"\$date"\s*:\s*"([^"]*)"/);
  if (date && Number.isNaN(Date.parse(date[1] ?? ''))) {
    return 'Extended JSON $date must be an ISO-8601 string.';
  }

  return null;
}
