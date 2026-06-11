/**
 * Lightweight DDL parser for instant schema import from pasted SQL.
 *
 * Extracts CREATE TABLE definitions (PostgreSQL, MySQL, SQLite, MSSQL, Oracle)
 * into the same SqlStructuralModel shape the design engine consumes.
 * Row counts default to 0; relationship stats use conservative defaults.
 */

import type { ForeignKeyModel, SqlStructuralModel, TableModel } from '../types.js';
import { sqlTypeToBsonType } from '../adapters/sqlite.js';

/** Regex to find CREATE TABLE blocks (supports optional IF NOT EXISTS and quoting). */
const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|'([^']+)'|`([^`]+)`|(\w+))\s*\(/gi;

/** Words that begin table/column constraint clauses (not part of the SQL type). */
const CONSTRAINT_KEYWORD =
  /\s+(?:GENERATED|DEFAULT|NOT\s+NULL|NULL|PRIMARY\s+KEY|UNIQUE|CHECK|CONSTRAINT|REFERENCES)\b/i;

const FK_LINE_RE =
  /(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\(\s*["'`]?(\w+)["'`]?\s*\)\s*REFERENCES\s+["'`]?(\w+)["'`]?\s*\(\s*["'`]?(\w+)["'`]?\s*\)/i;

const INLINE_REF_RE = /REFERENCES\s+["'`]?(\w+)["'`]?\s*\(\s*["'`]?(\w+)["'`]?\s*\)/i;

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

/** Parse a table-level or inline FOREIGN KEY constraint line. */
function parseForeignKeyLine(line: string): ForeignKeyModel | null {
  const match = line.trim().match(FK_LINE_RE);
  if (!match) return null;
  return {
    column: match[1],
    referencesTable: match[2],
    referencesColumn: match[3],
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
  if (/^(?:KEY|INDEX)\s/i.test(trimmed)) return true;
  return false;
}

/** Extract the SQL type token(s) before constraint keywords. */
function extractSqlType(rest: string): string {
  const withoutRef = rest.replace(INLINE_REF_RE, '').trim();
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
  const refMatch = rest.match(INLINE_REF_RE);
  if (refMatch) {
    foreignKey = { column: name, referencesTable: refMatch[1], referencesColumn: refMatch[2] };
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

  let match: RegExpExecArray | null;
  const re = new RegExp(CREATE_TABLE_RE.source, 'gi');
  while ((match = re.exec(ddl)) !== null) {
    const tableName = unquoteIdentifier(match[1] ?? match[2] ?? match[3] ?? match[4] ?? '');
    const start = match.index + match[0].length;
    let depth = 1;
    let pos = start;
    while (pos < ddl.length && depth > 0) {
      if (ddl[pos] === '(') depth += 1;
      if (ddl[pos] === ')') depth -= 1;
      pos += 1;
    }
    const body = ddl.slice(start, pos - 1);
    const lines = splitColumnDefinitions(body);

    const columns: TableModel['columns'] = [];
    const foreignKeys: ForeignKeyModel[] = [];
    const pkCols: string[] = [];

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
      columns.push({
        name: parsed.name,
        sqlType: parsed.sqlType,
        bsonType: sqlTypeToBsonType(parsed.sqlType),
        nullable: parsed.nullable,
        isPrimaryKey: parsed.isPrimaryKey,
      });
      if (parsed.isPrimaryKey) pkCols.push(parsed.name);
      if (parsed.foreignKey) foreignKeys.push(parsed.foreignKey);
    }

    tables.push({
      name: tableName,
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
