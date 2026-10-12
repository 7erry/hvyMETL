/**
 * Map a SQL column type string to the closest BSON type.
 * This stays out of the SQLite adapter so Studio's browser bundle can parse
 * schemas without loading better-sqlite3, which throws during module init.
 */
export function sqlTypeToBsonType(sqlType: string): string {
  const normalized = sqlType.toUpperCase();
  if (/(^|\b)(INT64|INT32|INT16|INT8|INTEGER|INT|SMALLINT|BIGINT|TINYINT|BYTEINT|NUMBER)\b/.test(normalized)) return 'long';
  if (/(^|\b)(FLOAT64|FLOAT32|REAL|FLOA|DOUB|NUMERIC|DECIMAL|DOUBLE)\b/.test(normalized)) return 'double';
  if (/(^|\b)(BOOL|BOOLEAN|BIT)\b/.test(normalized)) return 'bool';
  if (/(DATE|TIME|TIMESTAMP)/.test(normalized)) return 'date';
  if (/(BLOB|BYTES|BINARY|VARBINARY)/.test(normalized)) return 'binData';
  if (/(STRING|CHAR|CLOB|TEXT|VARCHAR|NVARCHAR|VARIANT|OBJECT|JSON|GEOGRAPHY)/.test(normalized)) return 'string';
  return 'string';
}
