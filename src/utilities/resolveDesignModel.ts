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
    return parseSchemaImport(ddl, dialect, `ddl:${dialect}`);
  }

  if (input.model?.tables?.length) {
    return input.model;
  }

  throw new Error('Provide ddl or model in body');
}
