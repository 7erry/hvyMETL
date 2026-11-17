/** Color bucket for a SQL or BSON type label on an ER card. */
export type TypeHighlight = 'string' | 'number' | 'date' | 'bool' | 'null' | 'binary' | 'object' | 'id';

const FAMILY: Record<string, TypeHighlight> = {
  char: 'string',
  nchar: 'string',
  varchar: 'string',
  varchar2: 'string',
  nvarchar: 'string',
  nvarchar2: 'string',
  text: 'string',
  ntext: 'string',
  clob: 'string',
  nclob: 'string',
  string: 'string',
  citext: 'string',
  xml: 'string',
  enum: 'string',
  set: 'string',
  int: 'number',
  integer: 'number',
  bigint: 'number',
  smallint: 'number',
  tinyint: 'number',
  mediumint: 'number',
  int2: 'number',
  int4: 'number',
  int8: 'number',
  int16: 'number',
  int32: 'number',
  int64: 'number',
  number: 'number',
  numeric: 'number',
  decimal: 'number',
  dec: 'number',
  float: 'number',
  double: 'number',
  real: 'number',
  money: 'number',
  serial: 'number',
  bigserial: 'number',
  long: 'number',
  byteint: 'number',
  decimal128: 'number',
  float32: 'number',
  float64: 'number',
  date: 'date',
  time: 'date',
  timestamp: 'date',
  datetime: 'date',
  timestamptz: 'date',
  datetime2: 'date',
  smalldatetime: 'date',
  year: 'date',
  interval: 'date',
  bool: 'bool',
  boolean: 'bool',
  bit: 'bool',
  null: 'null',
  undefined: 'null',
  blob: 'binary',
  bytea: 'binary',
  binary: 'binary',
  varbinary: 'binary',
  bindata: 'binary',
  bytes: 'binary',
  image: 'binary',
  raw: 'binary',
  object: 'object',
  json: 'object',
  jsonb: 'object',
  document: 'object',
  array: 'object',
  mixed: 'object',
  variant: 'object',
  javascript: 'object',
  regex: 'object',
  symbol: 'object',
  minkey: 'object',
  maxkey: 'object',
  dbpointer: 'object',
  objectid: 'id',
  uuid: 'id',
  uniqueidentifier: 'id',
  rowid: 'id',
};

/** First type token, so `VARCHAR2(100)`, `array<string>`, and `string | null` share one bucket. */
function typeToken(type: string): string {
  const trimmed = type.trim();
  if (trimmed.startsWith('{')) return 'object';
  const withoutSize = trimmed.replace(/\([^)]*\)/g, '').replace(/\[≤\d+\]/g, '').trim();
  const arrayInner = withoutSize.match(/^array<(.+)>$/i);
  const head = (arrayInner?.[1] ?? withoutSize).split('|')[0]?.trim() ?? '';
  const word = head.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (word === 'character' && /varying/i.test(head)) return 'varchar';
  return word;
}

export function typeHighlight(type: string): TypeHighlight | undefined {
  return FAMILY[typeToken(type)];
}

export function columnTypeClass(type: string): string {
  const highlight = typeHighlight(type);
  return highlight ? `column-type column-type--${highlight}` : 'column-type';
}
