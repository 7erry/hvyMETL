# 20 — DynamoDB GSI → MongoDB migration

Sources: [`src/utilities/dynamoGsiMongoMigration.ts`](../src/utilities/dynamoGsiMongoMigration.ts),
[`src/utilities/mongoFieldNaming.ts`](../src/utilities/mongoFieldNaming.ts),
[`examples/dynamodb/cms-platform-table.yaml`](../examples/dynamodb/cms-platform-table.yaml)

## 1. Overview

DynamoDB **Global Secondary Indexes (GSIs)** expose query patterns through a hash key, optional
range key, and a **projection** (`ALL`, `KEYS_ONLY`, or `INCLUDE`). MongoDB / Atlas offers two
common equivalents:

| DynamoDB GSI | MongoDB approach | Best for |
| --- | --- | --- |
| `INCLUDE` projection | **Compound index** + `find()` projection (covered query) | Exact key lookups, moderation queues, dashboards |
| Text-heavy projected fields | **Atlas Search** + `storedSource` + `returnStoredSource: true` | Full-text filters on `title`, `commentText`, etc. |

hvyMETL maps generic DynamoDB key placeholders (`GSI2PK`, `GSI2SK`) to **semantic MongoDB field
names** derived from the GSI index name (see [4.2.13](../RELEASE.md)).

## 2. Field naming

| DynamoDB | MongoDB field |
| --- | --- |
| `GSI2PK` on `GSI2-Author-Moderation-Index` | `gSI2AuthorModerationIndex` |
| `GSI2SK` on same index | `gSI2AuthorModerationIndexSortKey` |
| `ContentId` (projected attribute) | `contentId` |
| `CommentText` | `commentText` |

Utility: `mongoFieldNameForGsiAttribute()` and `toCamelCaseFromPascal()`.

## 3. Programmatic conversion

```typescript
import {
  buildAtlasSearchIndexFromGsi,
  buildMongoCompoundIndexFromGsi,
  buildMongoCoveredFindFromGsi,
  dynamoGsiMigrationInputFromModel,
} from '../src/utilities/dynamoGsiMongoMigration.js';
import { parseDynamoDbCloudFormationToModel } from '../src/utilities/dynamodbCloudFormationParser.js';

const model = parseDynamoDbCloudFormationToModel(cfnYaml);
const gsi = model.tables[0]!.dynamoDb!.globalSecondaryIndexes[1]!;
const input = dynamoGsiMigrationInputFromModel(gsi);

const compound = buildMongoCompoundIndexFromGsi(input);
const find = buildMongoCoveredFindFromGsi(input, 'MOD#PENDING');
const search = buildAtlasSearchIndexFromGsi(input, 'gsi2_author_moderation_search');
```

### Compound index (covered query)

`buildMongoCompoundIndexFromGsi()` returns:

- `keys` — equality field first, sort field second (`-1` for newest-first), then `INCLUDE` payload fields
- `coveredProjection` — fields safe to return without fetching the full document
- `name` — suggested snake_case index name

Create the index in Node.js:

```javascript
await collection.createIndex(compound.keys, { name: compound.name, background: true });
```

Run a covered query:

```javascript
await collection.find(find.filter, { projection: find.projection }).sort(find.sort).toArray();
```

Confirm with `.explain('executionStats')` → `totalDocsExamined: 0`.

### Atlas Search (`storedSource`)

`buildAtlasSearchIndexFromGsi()` returns:

- `definition` — `mappings` + `storedSource.include` mirroring the DynamoDB `NonKeyAttributes` list
- `samplePipeline` — `$search` with `returnStoredSource: true` and an equality filter on the GSI hash field

Use Atlas Search when queries need **text operators** (`text`, `autocomplete`, `phrase`) on projected
string fields. Use compound indexes for pure key-range access patterns.

## 4. CMS example: `GSI2-Author-Moderation-Index`

Bundled template: [`examples/dynamodb/cms-platform-table.yaml`](../examples/dynamodb/cms-platform-table.yaml)

| DynamoDB | Value |
| --- | --- |
| Hash key | `GSI2PK` → `gSI2AuthorModerationIndex` (e.g. `AUTHOR#{id}` or `MOD#PENDING`) |
| Range key | `GSI2SK` → `gSI2AuthorModerationIndexSortKey` (typically `updatedAt`) |
| Projection | `INCLUDE`: `contentId`, `title`, `authorId`, `status`, `commentText`, `userHandle`, `updatedAt` |

**Moderation queue query**

```javascript
await db.collection('cmsPlatform').find(
  { gSI2AuthorModerationIndex: 'MOD#PENDING' },
  {
    projection: {
      _id: 0,
      contentId: 1,
      title: 1,
      authorId: 1,
      status: 1,
      commentText: 1,
      userHandle: 1,
      updatedAt: 1,
    },
    sort: { gSI2AuthorModerationIndexSortKey: -1 },
  },
);
```

Load the example from Migration Studio: **Amazon DynamoDB (CloudFormation) - CMS Platform**.

## 5. Verification

```bash
npm test -- src/utilities/dynamoGsiMongoMigration.test.ts
npm test -- src/utilities/mongoFieldNaming.test.ts
npm test -- src/utilities/dynamodbCloudFormationParser.test.ts
```

## 6. Related releases

- [4.2.13](../RELEASE.md) — semantic GSI field names in migration plans
- [4.2.15](../RELEASE.md) — CSV pipeline applies DynamoDB field renaming on import
