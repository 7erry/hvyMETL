/**
 * Lightweight DDL parser for instant schema import from pasted SQL.
 *
 * Extracts CREATE TABLE definitions (PostgreSQL, MySQL, SQLite, MSSQL-ish)
 * into the same SqlStructuralModel shape the design engine consumes.
 * Row counts default to 0; relationship stats use conservative defaults.
 */

import type { ForeignKeyModel, SqlStructuralModel, TableModel } from '../types.js';
import { sqlTypeToBsonType } from '../adapters/sqlite.js';

/** Regex to find CREATE TABLE blocks (supports optional IF NOT EXISTS and quoting). */
const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|'([^']+)'|`([^`]+)`|(\w+))\s*\(/gi;

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
  if (!trimmed || /^PRIMARY\s+KEY\s*\(/i.test(trimmed)) return null;
  if (/^(CONSTRAINT|UNIQUE|KEY|INDEX|CHECK|FOREIGN)\s/i.test(trimmed) && !/^FOREIGN\s+KEY/i.test(trimmed)) {
    if (!/^FOREIGN\s+KEY/i.test(trimmed)) return null;
  }

  const fkOnly = trimmed.match(
    /^FOREIGN\s+KEY\s*\(\s*["'`]?(\w+)["'`]?\s*\)\s*REFERENCES\s+["'`]?(\w+)["'`]?\s*\(\s*["'`]?(\w+)["'`]?\s*\)/i,
  );
  if (fkOnly) {
    return {
      name: fkOnly[1],
      sqlType: 'INTEGER',
      nullable: true,
      isPrimaryKey: false,
      foreignKey: {
        column: fkOnly[1],
        referencesTable: fkOnly[2],
        referencesColumn: fkOnly[3],
      },
    };
  }

  const colMatch = trimmed.match(
    /^["'`]?(\w+)["'`]?\s+([A-Za-z][\w\s()]*?)(?:\s+(NOT\s+NULL|NULL|PRIMARY\s+KEY|REFERENCES.*))?$/i,
  );
  if (!colMatch) return null;

  const name = colMatch[1];
  let sqlType = colMatch[2].trim().split(/\s+/).slice(0, 2).join(' ');
  const tail = (colMatch[3] ?? '').toUpperCase();
  const isPrimaryKey = /PRIMARY\s+KEY/.test(tail) || /PRIMARY\s+KEY/i.test(trimmed);
  const nullable = !/NOT\s+NULL/.test(tail) && !isPrimaryKey;

  let foreignKey: ForeignKeyModel | null = null;
  const refMatch = trimmed.match(/REFERENCES\s+["'`]?(\w+)["'`]?\s*\(\s*["'`]?(\w+)["'`]?\s*\)/i);
  if (refMatch) {
    foreignKey = { column: name, referencesTable: refMatch[1], referencesColumn: refMatch[2] };
  }

  return { name, sqlType, nullable, isPrimaryKey, foreignKey };
}

/**
 * Parse a DDL script into a structural model suitable for ER diagrams and
 * the pattern selector (relationship stats use safe defaults when unknown).
 */
export function parseDdlToModel(ddl: string, sourceLabel = 'ddl:import'): SqlStructuralModel {
  const tables: TableModel[] = [];
  const tableMap = new Map<string, TableModel>();

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

    const table: TableModel = {
      name: tableName,
      columns,
      primaryKey: pkCols.length > 0 ? pkCols : columns[0] ? [columns[0].name] : [],
      foreignKeys,
      rowCount: 0,
    };
    tables.push(table);
    tableMap.set(tableName.toLowerCase(), table);
  }

  const relationships = tables.flatMap((child) =>
    child.foreignKeys.map((fk) => ({
      parentTable: fk.referencesTable,
      childTable: child.name,
      fkColumn: fk.column,
      avgChildrenPerParent: 1,
      maxChildrenPerParent: 1,
      isBounded: true,
    })),
  );

  return { source: sourceLabel, tables, relationships };
}
