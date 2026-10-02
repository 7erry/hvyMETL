import type { ColumnModel } from '../types.js';

/** Whether a child table represents postal / shipping addresses. */
export function isAddressLikeTable(tableName: string): boolean {
  return /address/i.test(tableName);
}

/** Whether a child table represents loyalty program enrollments. */
export function isLoyaltyLikeTable(tableName: string): boolean {
  return /loyalty/i.test(tableName);
}

/** BSON type and description overrides for MongoDB-friendly modeling. */
export function mongoJsonSchemaForColumn(column: ColumnModel, tableName: string): { bsonType: string | string[]; description: string } {
  const name = column.name.toLowerCase();
  const sql = column.sqlType.toUpperCase();
  const baseType = column.bsonType;
  let bsonType: string | string[] = column.nullable ? [baseType, 'null'] : baseType;

  if (
    /(credit_?limit|amount|price|balance|cost|fee|unit_?price|total_?amount)/i.test(name) &&
    (/(DECIMAL|NUMERIC|MONEY)/.test(sql) || (baseType === 'long' && /NUMBER/.test(sql)))
  ) {
    bsonType = column.nullable ? ['decimal', 'null'] : 'decimal';
    return {
      bsonType,
      description: `From SQL ${tableName}.${column.name} (${column.sqlType}); store as Decimal128 for exact currency (or integer cents as long).`,
    };
  }

  if (/country_?id|country_?code/i.test(name) && (baseType === 'string' || baseType === 'long')) {
    bsonType = column.nullable ? ['string', 'null'] : 'string';
    return {
      bsonType,
      description: `From SQL ${tableName}.${column.name}; prefer ISO 3166-1 alpha-2 codes (e.g. US, CA) over opaque numeric ids when denormalizing.`,
    };
  }

  return {
    bsonType,
    description: `From SQL column ${tableName}.${column.name} (${column.sqlType}).`,
  };
}
