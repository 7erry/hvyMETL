import type { ColumnModel, EmbeddedArrayPlan, IndexSpec, TableModel } from '../types.js';
import { mongoFieldNameForColumn } from '../utilities/mongoFieldNaming.js';
import { isAddressLikeTable } from './mongoSchemaProperty.js';

function findColumn(table: TableModel, pattern: RegExp): ColumnModel | undefined {
  return table.columns.find((column) => pattern.test(column.name));
}

/** Root-level $jsonSchema required fields including non-null business columns. */
export function rootRequiredFields(table: TableModel): string[] {
  const required = new Set<string>(['_id', 'schemaVersion']);
  for (const column of table.columns) {
    if (column.nullable) continue;
    if (column.isPrimaryKey && table.primaryKey.length === 1) continue;
    required.add(mongoFieldNameForColumn(column));
  }
  return [...required];
}

/** Required property names for one embedded address array item. */
export function requiredAddressEmbedItemFields(
  itemProperties: Record<string, unknown>,
): string[] {
  const required: string[] = [];
  if ('addressId' in itemProperties) required.push('addressId');
  const address = itemProperties.address as { properties?: Record<string, unknown> } | undefined;
  if (address?.properties) {
    for (const key of ['streetAddress', 'city']) {
      if (key in address.properties) required.push('address');
      break;
    }
    if (required.includes('address')) {
      return required;
    }
  }
  return required;
}

/** Hot-path indexes: email lookup, name sort, embedded address country filter. */
export function appendQueryPathIndexes(
  table: TableModel,
  collectionName: string,
  embeddedArrays: EmbeddedArrayPlan[],
  indexes: IndexSpec[],
): void {
  const email = findColumn(table, /email/i);
  if (email && email.bsonType === 'string') {
    const field = mongoFieldNameForColumn(email);
    if (!indexes.some((index) => index.options.name === `idx_${collectionName}_${field}_unique`)) {
      indexes.push({
        keys: { [field]: 1 },
        options: { name: `idx_${collectionName}_${field}_unique`, unique: true },
        reason: `Unique lookup by ${field} (typical login and support workflows).`,
      });
    }
  }

  const firstName = findColumn(table, /first_?name/i);
  const lastName = findColumn(table, /last_?name/i);
  if (firstName && lastName) {
    const firstField = mongoFieldNameForColumn(firstName);
    const lastField = mongoFieldNameForColumn(lastName);
    indexes.push({
      keys: { [lastField]: 1, [firstField]: 1 },
      options: { name: `idx_${collectionName}_${lastField}_${firstField}` },
      reason: 'Compound index for directory-style lastName + firstName queries.',
    });
  }

  const company = findColumn(table, /company_?name/i);
  if (company) {
    const field = mongoFieldNameForColumn(company);
    indexes.push({
      keys: { [field]: 1 },
      options: { name: `idx_${collectionName}_${field}` },
      reason: 'Filter B2B customers and accounts by company name.',
    });
  }

  for (const embed of embeddedArrays) {
    if (!isAddressLikeTable(embed.sourceTable)) continue;
    const countryPath = `${embed.field}.address.countryId`;
    indexes.push({
      keys: { [countryPath]: 1 },
      options: { name: `idx_${collectionName}_${embed.field}_country` },
      reason: 'Multikey index on embedded address country for regional filtering.',
    });
  }
}

/** Columns to duplicate when referencing large parent entities (customers, orders context). */
export function pickDenormReferenceColumns(parentTable: TableModel): string[] {
  const columns: string[] = [];
  const pk = parentTable.primaryKey[0];
  if (pk) columns.push(pk);

  const preferred = [/email/i, /first_?name/i, /last_?name/i, /company_?name/i];
  for (const pattern of preferred) {
    const column = findColumn(parentTable, pattern);
    if (column && !columns.includes(column.name)) columns.push(column.name);
  }
  return columns.slice(0, 4);
}

/** Parent entity tables worth Extended Reference denorm (not just small lookups). */
export function isDenormReferenceTarget(table: TableModel): boolean {
  if (table.foreignKeys.length > 2) return false;
  if (/^(customers?|employees?|users?|accounts?)$/i.test(table.name)) return true;
  return Boolean(findColumn(table, /email/i));
}
