/**
 * Canonical MongoDB documentation URLs for Architecture Review hyperlinks.
 * Prefer these exact links when the review mentions a topic (markdown `[label](url)`).
 */

export const MONGODB_DOC_LINKS = {
  dataModelingIntro: 'https://www.mongodb.com/docs/manual/data-modeling/',
  designPatterns: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/',
  embeddedDocuments: 'https://www.mongodb.com/docs/manual/data-modeling/embedding/',
  referencing: 'https://www.mongodb.com/docs/manual/data-modeling/referencing/',
  schemaValidation: 'https://www.mongodb.com/docs/manual/core/schema-validation/',
  buildingWithPatterns: 'https://www.mongodb.com/company/blog/building-with-patterns-a-summary',
  bsonDocumentLimit: 'https://www.mongodb.com/docs/manual/reference/limits/#mongodb-limit-BSON-Document-Size',
  esrRule: 'https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-rule/',
  indexes: 'https://www.mongodb.com/docs/manual/indexes/',
  multikeyIndexes: 'https://www.mongodb.com/docs/manual/core/index-multikey/',
  explainResults: 'https://www.mongodb.com/docs/manual/reference/explain-results/',
  queryPlans: 'https://www.mongodb.com/docs/manual/core/query-plans/',
  wiredTiger: 'https://www.mongodb.com/docs/manual/core/wiredtiger/',
  shardingShardKey: 'https://www.mongodb.com/docs/manual/core/sharding-shard-key/',
  replication: 'https://www.mongodb.com/docs/manual/replication/',
  writeConcern: 'https://www.mongodb.com/docs/manual/reference/write-concern/',
  readPreference: 'https://www.mongodb.com/docs/manual/core/read-preference/',
  oplog: 'https://www.mongodb.com/docs/manual/core/replica-set-oplog/',
  securityChecklist: 'https://www.mongodb.com/docs/manual/administration/security-checklist/',
  productionNotes: 'https://www.mongodb.com/docs/manual/administration/production-notes/',
  atlasSearch: 'https://www.mongodb.com/docs/search/',
  atlasVectorSearch: 'https://www.mongodb.com/docs/vector-search/',
  atlasAutoEmbed: 'https://www.mongodb.com/docs/vector-search/crud-embeddings/automated-embedding/',
  hybridSearchOverview: 'https://www.mongodb.com/docs/vector-search/hybrid-search/hybrid-search-overview/',
  hybridSearchTutorial: 'https://www.mongodb.com/docs/vector-search/hybrid-search/vector-search-with-full-text-search/',
  rankFusion: 'https://www.mongodb.com/docs/manual/reference/operator/aggregation/rankFusion/',
  vectorSearchStage: 'https://www.mongodb.com/docs/vector-search/query/aggregation-stages/vector-search-stage/',
  searchStage: 'https://www.mongodb.com/docs/search/query/aggregation-stages/search/',
  subsetPattern: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/group-data/subset-pattern/',
  bucketPattern: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/group-data/bucket-pattern/',
  outlierPattern: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/group-data/outlier-pattern/',
  attributePattern: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/group-data/attribute-pattern/',
  polymorphicPattern:
    'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/polymorphic-data/polymorphic-schema-pattern/',
  inheritancePattern:
    'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/polymorphic-data/inheritance-schema-pattern/',
  dataVersioning: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/data-versioning/',
  archivePattern: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/archive/',
  singleCollectionPattern: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/single-collection/',
  extendedReferencePattern: 'https://www.mongodb.com/docs/manual/data-modeling/handle-duplicate-data/',
  designAntipatterns: 'https://www.mongodb.com/docs/manual/data-modeling/design-antipatterns/',
  embedOneToOne:
    'https://www.mongodb.com/docs/manual/tutorial/model-embedded-one-to-one-relationships-between-documents/',
  embedOneToMany:
    'https://www.mongodb.com/docs/manual/tutorial/model-embedded-one-to-many-relationships-between-documents/',
  embedManyToMany:
    'https://www.mongodb.com/docs/manual/tutorial/model-embedded-many-to-many-relationships-between-documents/',
  treeStructures: 'https://www.mongodb.com/docs/manual/applications/data-models-tree-structures/',
  timeSeries: 'https://www.mongodb.com/docs/manual/core/timeseries-collections/',
} as const;

/** Markdown link helper for prompt templates. */
export function mongodbDocLink(label: string, key: keyof typeof MONGODB_DOC_LINKS): string {
  return `[${label}](${MONGODB_DOC_LINKS[key]})`;
}

export const ARCHITECTURE_REVIEW_DOC_LINKING_RULES = `
**MongoDB documentation hyperlinks (required in every Architecture Review)**

When you mention a MongoDB or Atlas concept below, link the **first occurrence** in each collapsible section using markdown \`[label](url)\`. Use these canonical URLs (do not invent or shorten):

| Topic | Link |
| --- | --- |
| Data modeling | ${mongodbDocLink('Data modeling', 'dataModelingIntro')}, ${mongodbDocLink('Design patterns', 'designPatterns')}, ${mongodbDocLink('Building with Patterns', 'buildingWithPatterns')} |
| Embedding vs referencing | ${mongodbDocLink('Embedded documents', 'embeddedDocuments')}, ${mongodbDocLink('Document references', 'referencing')} |
| Schema validation | ${mongodbDocLink('JSON Schema validation', 'schemaValidation')} |
| 16 MB BSON limit | ${mongodbDocLink('BSON document size limit', 'bsonDocumentLimit')} |
| ESR compound indexes | ${mongodbDocLink('ESR (Equality, Sort, Range) rule', 'esrRule')} |
| Indexes & multikey | ${mongodbDocLink('Indexes', 'indexes')}, ${mongodbDocLink('Multikey indexes', 'multikeyIndexes')} |
| Query plans / explain | ${mongodbDocLink('explain results', 'explainResults')}, ${mongodbDocLink('Query plans', 'queryPlans')} |
| WiredTiger / working set | ${mongodbDocLink('WiredTiger storage engine', 'wiredTiger')} |
| Sharding & shard keys | ${mongodbDocLink('Shard keys', 'shardingShardKey')} |
| High availability | ${mongodbDocLink('Replication', 'replication')}, ${mongodbDocLink('Write concern', 'writeConcern')}, ${mongodbDocLink('Read preference', 'readPreference')}, ${mongodbDocLink('Oplog', 'oplog')} |
| Security & operations | ${mongodbDocLink('Security checklist', 'securityChecklist')}, ${mongodbDocLink('Production notes', 'productionNotes')} |
| MongoDB Search (lexical) | ${mongodbDocLink('MongoDB Search', 'atlasSearch')}, ${mongodbDocLink('$search stage', 'searchStage')} |
| MongoDB Vector Search | ${mongodbDocLink('MongoDB Vector Search', 'atlasVectorSearch')}, ${mongodbDocLink('Automated Embedding (autoEmbed)', 'atlasAutoEmbed')}, ${mongodbDocLink('$vectorSearch stage', 'vectorSearchStage')} |
| Hybrid search & RRF | ${mongodbDocLink('Hybrid search overview', 'hybridSearchOverview')}, ${mongodbDocLink('Vector + full-text hybrid tutorial', 'hybridSearchTutorial')}, ${mongodbDocLink('$rankFusion (Reciprocal Rank Fusion)', 'rankFusion')} |
| Group-data patterns | ${mongodbDocLink('Subset pattern', 'subsetPattern')}, ${mongodbDocLink('Bucket pattern', 'bucketPattern')}, ${mongodbDocLink('Outlier pattern', 'outlierPattern')}, ${mongodbDocLink('Attribute pattern', 'attributePattern')} |
| Polymorphic patterns | ${mongodbDocLink('Polymorphic schema pattern', 'polymorphicPattern')}, ${mongodbDocLink('Inheritance pattern', 'inheritancePattern')} |
| Versioning & archival | ${mongodbDocLink('Document and schema versioning', 'dataVersioning')}, ${mongodbDocLink('Archive pattern', 'archivePattern')} |
| Other design patterns | ${mongodbDocLink('Extended reference / duplicate data', 'extendedReferencePattern')}, ${mongodbDocLink('Single collection pattern', 'singleCollectionPattern')}, ${mongodbDocLink('Time series collections', 'timeSeries')} |
| Anti-patterns | ${mongodbDocLink('Schema design anti-patterns', 'designAntipatterns')} |
| Relationship modeling | ${mongodbDocLink('Embedded one-to-one', 'embedOneToOne')}, ${mongodbDocLink('Embedded one-to-many', 'embedOneToMany')}, ${mongodbDocLink('Embedded many-to-many', 'embedManyToMany')}, ${mongodbDocLink('Tree structures', 'treeStructures')} |

Also link pattern names in §3 to the matching design-pattern doc when cited.
`.trim();
