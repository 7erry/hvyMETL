/**
 * MongoDB field naming for DynamoDB CloudFormation imports.
 *
 * DynamoDB single-table designs use generic key placeholders (GSI1PK, GSI1SK).
 * Migration plans should expose semantic names derived from GSI index names.
 */

import type { ColumnModel } from '../types.js';
import { toCamelCase } from './naming.js';

/** Convert hyphen/underscore delimited DynamoDB names to camelCase field names. */
export function toCamelCaseFromDelimited(name: string): string {
  const parts = name.split(/[-_\s]+/).filter(Boolean);
  if (parts.length === 0) return name;
  const [first, ...rest] = parts;
  return (
    first!.charAt(0).toLowerCase() +
    first!.slice(1) +
    rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
  );
}

/** Map a structural column to the MongoDB document field name used in migration plans. */
export function mongoFieldNameForColumn(column: ColumnModel): string {
  switch (column.dynamoKeyRole) {
    case 'pk-hash':
      return 'partitionKey';
    case 'pk-range':
      return 'sortKey';
    case 'gsi-hash':
      return column.dynamoGsiName ? toCamelCaseFromDelimited(column.dynamoGsiName) : toCamelCase(column.name);
    case 'gsi-range':
      return column.dynamoGsiName
        ? `${toCamelCaseFromDelimited(column.dynamoGsiName)}SortKey`
        : toCamelCase(column.name);
    case 'ttl':
      return toCamelCase(column.name);
    default:
      return toCamelCase(column.name);
  }
}
