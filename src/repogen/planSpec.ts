import type { CollectionPlan, MigrationPlan } from '../types.js';
import { toCamelCase, toPascalCase } from '../utilities/naming.js';

/** One field from the plan $jsonSchema used to emit typed document shapes. */
export type SchemaFieldSpec = {
  name: string;
  optional: boolean;
  bsonType: string | string[] | undefined;
};

/** Language-neutral codegen input for one collection. */
export type CollectionCodegenSpec = {
  name: string;
  pascalName: string;
  camelName: string;
  sourceTable: string;
  fields: SchemaFieldSpec[];
  indexes: CollectionPlan['indexes'];
  computedFields: CollectionPlan['computedFields'];
  embeddedArrays: CollectionPlan['embeddedArrays'];
  bucket: CollectionPlan['bucket'];
  extendedReferences: CollectionPlan['extendedReferences'];
};

/** Build schema field specs from a collection plan. */
function buildFields(collection: CollectionPlan): SchemaFieldSpec[] {
  const properties = (collection.jsonSchema.properties ?? {}) as Record<
    string,
    { bsonType?: string | string[] }
  >;
  const required = new Set((collection.jsonSchema.required ?? []) as string[]);

  return Object.entries(properties).map(([name, property]) => ({
    name,
    optional: !required.has(name) && name !== 'schemaVersion',
    bsonType: property.bsonType,
  }));
}

/** Convert a migration plan into language-neutral collection specs. */
export function buildCollectionSpecs(plan: MigrationPlan): CollectionCodegenSpec[] {
  return plan.collections.map((collection) => ({
    name: collection.name,
    pascalName: toPascalCase(collection.name),
    camelName: toCamelCase(collection.name),
    sourceTable: collection.sourceTable,
    fields: buildFields(collection),
    indexes: collection.indexes,
    computedFields: collection.computedFields,
    embeddedArrays: collection.embeddedArrays,
    bucket: collection.bucket,
    extendedReferences: collection.extendedReferences,
  }));
}
