/**
 * Adapt non-SQL schema imports (e.g. DynamoDB CloudFormation) into CREATE TABLE DDL
 * that generators/ddl_csv_generator.py can turn into mock CSV files.
 */

import type { SqlStructuralModel, TableModel } from '../types.js';
import { parseSchemaImport } from './schemaImport.js';

/** True when pasted content is a CloudFormation template rather than SQL DDL. */
export function isCloudFormationImport(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  return (
    /AWSTemplateFormatVersion/i.test(trimmed) ||
    /AWS::DynamoDB::Table/.test(trimmed) ||
    (trimmed.startsWith('{') && trimmed.includes('AWS::DynamoDB::Table'))
  );
}

/** Quote SQL identifiers that are not simple unquoted names. */
function quoteSqlIdentifier(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
  return `"${name.replace(/"/g, '""')}"`;
}

/** Map DynamoDB attribute types from the structural model to SQL types for mock CSV generation. */
function dynamoAttributeTypeToSql(sqlType: string): string {
  const base = sqlType.split(/\s+/)[0]?.toUpperCase() ?? 'STRING';
  if (base === 'STRING') return 'VARCHAR(255)';
  if (base === 'NUMBER') return 'INTEGER';
  if (base === 'BINARY') return 'TEXT';
  return 'VARCHAR(255)';
}

/** Infer parent table FK when a column matches another table's partition/sort key name (subset demos). */
function inferForeignKeyReference(
  columnName: string,
  table: TableModel,
  model: SqlStructuralModel,
): string | null {
  if (table.primaryKey.includes(columnName)) return null;
  const match = columnName.match(/^(.+)Id$/i);
  if (!match) return null;

  const stem = match[1]!;
  const parentCandidates = new Set([`${stem}s`, stem, `${stem}es`].map((value) => value.toLowerCase()));

  for (const candidate of model.tables) {
    if (candidate.name === table.name) continue;
    if (!parentCandidates.has(candidate.name.toLowerCase())) continue;
    const parentColumn = candidate.primaryKey.find((key) => key.toLowerCase() === columnName.toLowerCase());
    if (parentColumn) {
      return `REFERENCES ${quoteSqlIdentifier(candidate.name)}(${quoteSqlIdentifier(parentColumn)})`;
    }
  }

  return null;
}

/** Render one CREATE TABLE block from a parsed structural model table. */
function renderCreateTable(table: TableModel, model: SqlStructuralModel): string {
  const columnLines = table.columns.map((column) => {
    const parts = [`${quoteSqlIdentifier(column.name)} ${dynamoAttributeTypeToSql(column.sqlType)}`];
    if (column.isPrimaryKey) parts.push('PRIMARY KEY');
    else if (!column.nullable) parts.push('NOT NULL');

    const foreignKey = inferForeignKeyReference(column.name, table, model);
    if (foreignKey) parts.push(foreignKey);

    return `  ${parts.join(' ')}`;
  });

  return `CREATE TABLE ${quoteSqlIdentifier(table.name)} (\n${columnLines.join(',\n')}\n);`;
}

/** Convert a structural model into SQL DDL understood by the Python mock CSV generator. */
export function structuralModelToMockDdl(model: SqlStructuralModel): string {
  if (model.tables.length === 0) {
    throw new Error('No tables found to generate mock CSV DDL.');
  }
  return model.tables.map((table) => renderCreateTable(table, model)).join('\n\n');
}

/**
 * Normalize schema import content for mock CSV generation.
 * SQL dialects pass through unchanged; CloudFormation templates become CREATE TABLE DDL.
 */
export function prepareMockCsvDdl(content: string, dialect?: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('DDL is required to generate mock CSV data.');
  }

  const useCloudFormation = dialect === 'dynamodb' || isCloudFormationImport(trimmed);
  if (!useCloudFormation) {
    return trimmed;
  }

  const model = parseSchemaImport(trimmed, 'dynamodb', 'mock-csv:dynamodb');
  return structuralModelToMockDdl(model);
}
