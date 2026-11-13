import type { SqlStructuralModel } from '../types.js';
import { parseSchemaImport, resolveSchemaImportDialect } from './schemaImport.js';

/** Resolve the structural model used by design/export endpoints (prefer fresh DDL parse). */
export function resolveDesignModel(input: {
  ddl?: string;
  dialect?: string;
  model?: SqlStructuralModel;
}): SqlStructuralModel {
  const ddl = input.ddl?.trim();
  if (ddl) {
    const dialect = resolveSchemaImportDialect(ddl, input.dialect ?? 'import');
    const fromDdl = parseSchemaImport(ddl, dialect, `ddl:${dialect}`);
    // Live-agent DDL is a comment stub ("// Live PostgreSQL…"); keep the introspected model.
    if (fromDdl.tables.length === 0 && input.model?.tables?.length) {
      return input.model;
    }
    return fromDdl;
  }

  if (input.model?.tables?.length) {
    return input.model;
  }

  throw new Error('Provide ddl or model in body');
}
