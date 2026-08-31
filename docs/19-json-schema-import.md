# 19 — JSON Schema import dialect

Sources: [`src/utilities/jsonSchemaParser.ts`](../src/utilities/jsonSchemaParser.ts),
[`src/utilities/schemaImport.ts`](../src/utilities/schemaImport.ts),
[`src/dialects.ts`](../src/dialects.ts)

## Summary

The **`json-schema`** dialect lets you paste [JSON Schema](https://json-schema.org/) documents
(draft **2020-12**) into Migration Studio instead of SQL `CREATE TABLE` scripts. Each object
schema becomes a logical table with properties mapped to columns; **`$ref`** links become foreign
keys, similar to DynamoDB CloudFormation import.

Official example shapes (address, blog post, user profile, and related patterns) are documented on
the JSON Schema site: [JSON Schema examples](https://json-schema.org/learn/json-schema-examples).

## Supported paste formats

| Format | Description |
| --- | --- |
| **Single schema** | One root document with `"type": "object"` and `"properties"`. Nested objects and array-of-object fields are promoted to child tables with foreign keys. |
| **hvyMETL bundle** | `{ "description": "…", "schemas": [ … ] }` — preferred for multi-entity models. |
| **`$defs` document** | Root document whose `"$defs"` contains object schemas (e.g. [ecommerce example](https://json-schema.org/learn/json-schema-examples)); `$anchor` and `#Anchor` `$ref` values are resolved. |

Table names come from each schema’s **`title`**, or from the last segment of **`$id`**
(for example `https://example.com/user-profile.schema.json` → `user_profile`).

## Type mapping

| JSON Schema | SQL-ish column type | BSON hint |
| --- | --- | --- |
| `string` | `VARCHAR(255)` | `string` |
| `string` + `format: date-time` | `TIMESTAMP` | `date` |
| `string` + `format: date` | `DATE` | `date` |
| `integer` | `INTEGER` | `int` |
| `number` | `NUMERIC(18,4)` | `double` |
| `boolean` | `BOOLEAN` | `bool` |
| `array` | `JSON` | `array` |
| `$ref` | `VARCHAR(64)` + FK | `objectId` |

`required` arrays define primary-key columns. When `$ref` targets another schema in the same
bundle, the design engine receives a parent/child relationship edge.

## Bundled example

```text
examples/dialects/json-schema.json
```

Regenerate with the rest of the dialect matrix:

```bash
npm run generate-dialect-examples
```

Load from **Load example** (`JSON Schema - …`) or import with dialect **`json-schema`**
selected.

## API

```bash
curl -X POST http://localhost:3847/api/schema/import-ddl \
  -H 'Content-Type: application/json' \
  -d @- <<'EOF'
{
  "dialect": "json-schema",
  "ddl": "{\"$schema\":\"https://json-schema.org/draft/2020-12/schema\",\"type\":\"object\",\"title\":\"address\",\"required\":[\"locality\",\"region\",\"countryName\"],\"properties\":{\"locality\":{\"type\":\"string\"},\"region\":{\"type\":\"string\"},\"countryName\":{\"type\":\"string\"}}}"
}
EOF
```

## Tests

- [`src/utilities/jsonSchemaParser.test.ts`](../src/utilities/jsonSchemaParser.test.ts) — address
  and blog-post `$ref` fixtures aligned with json-schema.org examples.
- [`src/examples/dialectExamples.test.ts`](../src/examples/dialectExamples.test.ts) — bundled
  `json-schema.json` parses and satisfies pattern signature tables.

See also [18 — Supported SQL Dialects & DDL Import](18-sql-dialects.md).
