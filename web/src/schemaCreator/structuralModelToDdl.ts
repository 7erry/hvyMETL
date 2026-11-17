import type { SqlStructuralModel, TableModel } from '../types';

function quoteIdent(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
  return `"${name.replace(/"/g, '""')}"`;
}

function renderCreateTable(table: TableModel): string {
  const pkSet = new Set(table.primaryKey.length ? table.primaryKey : table.columns.filter((c) => c.isPrimaryKey).map((c) => c.name));
  const columnLines = table.columns.map((column) => {
    const parts = [`${quoteIdent(column.name)} ${column.sqlType || 'VARCHAR(255)'}`];
    if (pkSet.has(column.name)) parts.push('PRIMARY KEY');
    else if (!column.nullable) parts.push('NOT NULL');
    const fk = table.foreignKeys.find((f) => f.column === column.name);
    if (fk) {
      parts.push(`REFERENCES ${quoteIdent(fk.referencesTable)}(${quoteIdent(fk.referencesColumn)})`);
    }
    return `  ${parts.join(' ')}`;
  });
  return `CREATE TABLE ${quoteIdent(table.name)} (\n${columnLines.join(',\n')}\n);`;
}

/** Synthesize CREATE TABLE DDL from a structural model for Before · SQL. */
export function structuralModelToDdl(model: SqlStructuralModel): string {
  if (model.tables.length === 0) {
    throw new Error('Add at least one table before using as Before SQL.');
  }
  for (const table of model.tables) {
    if (!table.name.trim()) throw new Error('Every table needs a name.');
    if (table.columns.length === 0) throw new Error(`Table "${table.name}" needs at least one column.`);
    for (const column of table.columns) {
      if (!column.name.trim()) throw new Error(`Table "${table.name}" has an unnamed column.`);
    }
  }
  return model.tables.map(renderCreateTable).join('\n\n');
}
