/**
 * Lightweight DDL parser for instant schema import from pasted SQL.
 *
 * Extracts CREATE TABLE definitions (PostgreSQL, MySQL, SQLite, MSSQL, Oracle,
 * IBM Db2, CockroachDB, Amazon Aurora, Google Cloud Spanner) into the same
 * SqlStructuralModel shape the design engine consumes.
 * Row counts default to 0; relationship stats use conservative defaults.
 */

import type { ForeignKeyModel, SqlStructuralModel, TableModel } from '../types.js';
import { sqlTypeToBsonType } from '../adapters/sqlite.js';

/** Words that begin table/column constraint clauses (not part of the SQL type). */
const CONSTRAINT_KEYWORD =
  /\s+(?:GENERATED|DEFAULT|NOT\s+NULL|NULL|PRIMARY\s+KEY|UNIQUE|CHECK|CONSTRAINT|REFERENCES|OPTIONS)\b/i;

/** Parse one SQL identifier (quoted or bare) starting at pos. */
function parseIdentifierAt(text: string, pos: number): { value: string; next: number } | null {
  let index = pos;
  while (index < text.length && /\s/.test(text[index]!)) index += 1;
  if (index >= text.length) return null;

  const quote = text[index]!;
  if (quote === '"' || quote === "'" || quote === '`') {
    index += 1;
    let value = '';
    while (index < text.length && text[index] !== quote) {
      value += text[index]!;
      index += 1;
    }
    if (text[index] === quote) index += 1;
    return { value, next: index };
  }

  if (/[\w$#@]/.test(quote)) {
    let value = '';
    while (index < text.length && /[\w$#@]/.test(text[index]!)) {
      value += text[index]!;
      index += 1;
    }
    return { value, next: index };
  }

  return null;
}

/** Parse a possibly schema-qualified table name (e.g. SALES.CUSTOMERS or "SALES"."CUSTOMERS"). */
function parseQualifiedTableName(text: string, pos: number): { name: string; next: number } | null {
  const first = parseIdentifierAt(text, pos);
  if (!first) return null;

  let name = first.value;
  let index = first.next;
  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index]!)) index += 1;
    if (text[index] !== '.') break;
    index += 1;
    const nextPart = parseIdentifierAt(text, index);
    if (!nextPart) break;
    name = `${name}.${nextPart.value}`;
    index = nextPart.next;
  }

  return { name, next: index };
}

/** Extract trailing PRIMARY KEY (…) after the column list — used by Google Cloud Spanner. */
function parseTrailingPrimaryKey(text: string, pos: number): { columns: string[]; next: number } {
  let index = pos;
  while (index < text.length && /\s/.test(text[index]!)) index += 1;

  const match = text.slice(index).match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
  if (!match) return { columns: [], next: index };

  const columns = match[1]
    .split(',')
    .map((column) => unquoteIdentifier(column.trim()))
    .filter(Boolean);

  return { columns, next: index + match[0].length };
}

/** Locate CREATE TABLE blocks with optional qualified names and Spanner-style trailing PKs. */
function findCreateTableBlocks(
  ddl: string,
): { tableName: string; body: string; trailingPrimaryKey: string[] }[] {
  const blocks: { tableName: string; body: string; trailingPrimaryKey: string[] }[] = [];
  const headRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/gi;
  let headMatch: RegExpExecArray | null;

  while ((headMatch = headRe.exec(ddl)) !== null) {
    const tableRef = parseQualifiedTableName(ddl, headMatch.index + headMatch[0].length);
    if (!tableRef) continue;

    let pos = tableRef.next;
    while (pos < ddl.length && /\s/.test(ddl[pos]!)) pos += 1;
    if (ddl[pos] !== '(') continue;

    pos += 1;
    const bodyStart = pos;
    let depth = 1;
    while (pos < ddl.length && depth > 0) {
      if (ddl[pos] === '(') depth += 1;
      if (ddl[pos] === ')') depth -= 1;
      pos += 1;
    }

    const trailingPk = parseTrailingPrimaryKey(ddl, pos);
    blocks.push({
      tableName: tableRef.name,
      body: ddl.slice(bodyStart, pos - 1),
      trailingPrimaryKey: trailingPk.columns,
    });
  }

  return blocks;
}

/** Optional schema/catalog prefix before a referenced table name in inline column refs. */
const INLINE_REF_MARKER = /\bREFERENCES\b/i;

/**
 * Split a CREATE TABLE column list on commas, respecting nested parentheses.
 */
function splitColumnDefinitions(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Strip identifier quotes from a table or column name. */
function unquoteIdentifier(name: string): string {
  return name.replace(/^["'`]|["'`]$/g, '');
}

/** Parse REFERENCES target clause into table and column (handles schema-qualified names). */
function parseReferenceTarget(refClause: string): { table: string; column: string } | null {
  const open = refClause.lastIndexOf('(');
  if (open === -1) return null;
  const tablePart = refClause.slice(0, open).trim();
  const close = refClause.lastIndexOf(')');
  const colPart = close > open ? refClause.slice(open + 1, close).trim() : '';
  const segments = tablePart.split('.').map((segment) => unquoteIdentifier(segment.trim()));
  const table = segments[segments.length - 1];
  const column = unquoteIdentifier(colPart);
  if (!table || !column) return null;
  return { table, column };
}

/** Parse a table-level or inline FOREIGN KEY constraint line. */
function parseForeignKeyLine(line: string): ForeignKeyModel | null {
  const trimmed = line.trim();
  const match = trimmed.match(/(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(.+)/i);
  if (!match) return null;
  const column = unquoteIdentifier(match[1].trim());
  const target = parseReferenceTarget(match[2].replace(/[,;].*$/, '').trim());
  if (!target) return null;
  return {
    column,
    referencesTable: target.table,
    referencesColumn: target.column,
  };
}

/** True when the line is a table constraint we should not treat as a column definition. */
function isNonColumnConstraint(line: string): boolean {
  const trimmed = line.trim();
  if (/^PRIMARY\s+KEY\s*\(/i.test(trimmed)) return true;
  if (/^UNIQUE\s*\(/i.test(trimmed)) return true;
  if (/^CHECK\s*\(/i.test(trimmed)) return true;
  if (/^FOREIGN\s+KEY\s*\(/i.test(trimmed)) return true;
  if (/^CONSTRAINT\s+\w+\s+FOREIGN\s+KEY\s*\(/i.test(trimmed)) return true;
  if (/^CONSTRAINT\s+\w+\s+(?:UNIQUE|CHECK|PRIMARY\s+KEY)\b/i.test(trimmed)) return true;
  if (/^INTERLEAVE\s+IN\s+PARENT\b/i.test(trimmed)) return true;
  if (/^(?:KEY|INDEX)\s/i.test(trimmed)) return true;
  return false;
}

/** Extract the SQL type token(s) before constraint keywords. */
function extractSqlType(rest: string): string {
  const refAt = rest.search(INLINE_REF_MARKER);
  const withoutRef = refAt === -1 ? rest : rest.slice(0, refAt).trim();
  const constraintAt = withoutRef.search(CONSTRAINT_KEYWORD);
  if (constraintAt === -1) return withoutRef.trim();
  return withoutRef.slice(0, constraintAt).trim();
}

/**
 * Parse one column line into column metadata, or null for table-level constraints.
 */
function parseColumnLine(line: string): {
  name: string;
  sqlType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  foreignKey: ForeignKeyModel | null;
} | null {
  const trimmed = line.trim();
  if (!trimmed || isNonColumnConstraint(trimmed)) return null;

  const colMatch = trimmed.match(/^["'`]?(\w+)["'`]?\s+(.+)$/s);
  if (!colMatch) return null;

  const name = colMatch[1];
  const rest = colMatch[2];

  const isPrimaryKey = /\bPRIMARY\s+KEY\b/i.test(rest);
  const nullable = !/\bNOT\s+NULL\b/i.test(rest) && !isPrimaryKey;
  const sqlType = extractSqlType(rest);

  let foreignKey: ForeignKeyModel | null = null;
  const refAt = rest.search(INLINE_REF_MARKER);
  if (refAt !== -1) {
    const refClause = rest.slice(refAt).replace(/^REFERENCES\s+/i, '').trim();
    const target = parseReferenceTarget(refClause);
    if (target) {
      foreignKey = { column: name, referencesTable: target.table, referencesColumn: target.column };
    }
  }

  return { name, sqlType, nullable, isPrimaryKey, foreignKey };
}

/** Add stub tables for FK targets not defined in the DDL script. */
function ensureReferencedTables(tables: TableModel[]): TableModel[] {
  const byName = new Map(tables.map((table) => [table.name.toLowerCase(), table]));
  const stubs: TableModel[] = [];

  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      const refKey = fk.referencesTable.toLowerCase();
      if (byName.has(refKey)) continue;
      const stub: TableModel = {
        name: fk.referencesTable,
        columns: [
          {
            name: fk.referencesColumn,
            sqlType: 'UNKNOWN',
            bsonType: 'string',
            nullable: false,
            isPrimaryKey: true,
          },
        ],
        primaryKey: [fk.referencesColumn],
        foreignKeys: [],
        rowCount: 0,
      };
      byName.set(refKey, stub);
      stubs.push(stub);
    }
  }

  return stubs.length > 0 ? [...tables, ...stubs] : tables;
}

/**
 * Parse a DDL script into a structural model suitable for ER diagrams and
 * the pattern selector (relationship stats use safe defaults when unknown).
 */
export function parseDdlToModel(ddl: string, sourceLabel = 'ddl:import'): SqlStructuralModel {
  const tables: TableModel[] = [];

  for (const block of findCreateTableBlocks(ddl)) {
    const lines = splitColumnDefinitions(block.body);
    const columns: TableModel['columns'] = [];
    const foreignKeys: ForeignKeyModel[] = [];
    const pkCols: string[] = [...block.trailingPrimaryKey];

    for (const line of lines) {
      const fkLine = parseForeignKeyLine(line);
      if (fkLine) {
        foreignKeys.push(fkLine);
        continue;
      }

      const parsed = parseColumnLine(line);
      if (!parsed) {
        const inlinePk = line.match(/PRIMARY\s+KEY\s*\(\s*["'`]?(\w+)["'`]?(?:\s*,\s*["'`]?(\w+)["'`]?)?\s*\)/i);
        if (inlinePk) {
          pkCols.push(inlinePk[1]);
          if (inlinePk[2]) pkCols.push(inlinePk[2]);
        }
        continue;
      }

      const isPk = parsed.isPrimaryKey || pkCols.includes(parsed.name);
      columns.push({
        name: parsed.name,
        sqlType: parsed.sqlType,
        bsonType: sqlTypeToBsonType(parsed.sqlType),
        nullable: parsed.nullable,
        isPrimaryKey: isPk,
      });
      if (isPk && !pkCols.includes(parsed.name)) pkCols.push(parsed.name);
      if (parsed.foreignKey) foreignKeys.push(parsed.foreignKey);
    }

    tables.push({
      name: block.tableName,
      columns,
      primaryKey: pkCols.length > 0 ? pkCols : columns[0] ? [columns[0].name] : [],
      foreignKeys,
      rowCount: 0,
    });
  }

  const allTables = ensureReferencedTables(tables);

  const relationships = allTables.flatMap((child) =>
    child.foreignKeys.map((fk) => ({
      parentTable: fk.referencesTable,
      childTable: child.name,
      fkColumn: fk.column,
      avgChildrenPerParent: 1,
      maxChildrenPerParent: 1,
      isBounded: true,
    })),
  );

  return { source: sourceLabel, tables: allTables, relationships };
}
