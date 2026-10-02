import { singularize, toCamelCase, toPascalCase } from '../utilities/naming.js';
import { isAddressLikeTable, isLoyaltyLikeTable } from './mongoSchemaProperty.js';

/** Strip parent prefix from child table names (customer_addresses → addresses). */
export function childSemanticBaseName(parentTable: string, childTable: string): string {
  const child = childTable.toLowerCase();
  const parentSingular = singularize(parentTable).toLowerCase();
  const parentPrefix = `${parentSingular}_`;
  if (child.startsWith(parentPrefix)) return child.slice(parentPrefix.length);
  const parentPlural = parentTable.toLowerCase();
  if (child.startsWith(`${parentPlural}_`)) return child.slice(parentPlural.length + 1);
  return child;
}

/** MongoDB field name for a fully embedded child array or object. */
export function fullEmbedFieldName(parentTable: string, childTable: string): string {
  if (isLoyaltyLikeTable(childTable)) return 'loyalty';
  const base = childSemanticBaseName(parentTable, childTable);
  if (isAddressLikeTable(childTable)) return toCamelCase(base);
  return toCamelCase(childTable);
}

/** MongoDB field name for Subset-pattern embedded arrays (recent N on parent). */
export function subsetEmbedFieldName(parentTable: string, childTable: string): string {
  if (isAddressLikeTable(childTable)) return 'recentAddresses';
  const base = childSemanticBaseName(parentTable, childTable);
  return `recent${toPascalCase(base.replace(/_/g, ' '))}`;
}

/** Computed counter field for referenced or subsetted children. */
export function computedTotalFieldName(parentTable: string, childTable: string): string {
  if (isAddressLikeTable(childTable)) return 'totalAddresses';
  const base = childSemanticBaseName(parentTable, childTable);
  return `total${toPascalCase(base.replace(/_/g, ' '))}`;
}

/** Loyalty enrollments are always few per parent — never use Subset + overflow. */
export function shouldFullEmbedLoyaltyChild(childTable: string): boolean {
  return isLoyaltyLikeTable(childTable);
}
