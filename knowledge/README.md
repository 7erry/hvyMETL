# hvyMETL Knowledge Base

Markdown pattern briefs consumed by the design engine RAG layer (`src/rag/`)
and Copilot Architecture Review. Each file describes when to apply a MongoDB
schema pattern, trade-offs, and how hvyMETL automates (or should handle) the
shape in pipeline code.

Official pattern catalog: [MongoDB Manual — Schema Design Patterns](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/)

## Index

| Document | Summary |
| --- | --- |
| [migration-principles.md](migration-principles.md) | Cross-cutting SQL-to-Mongo rules — embed over 1-to-1, denormalization, change streams, lean driver usage |
| [embed-vs-reference.md](embed-vs-reference.md) | When to nest documents vs store FK references |
| [extended-reference.md](extended-reference.md) | Duplicate hot lookup fields to avoid `$lookup` on reads |
| [subset.md](subset.md) | Store a working subset of large parent documents on children |
| [attribute.md](attribute.md) | EAV / multi-attribute columns as structured arrays |
| [computed.md](computed.md) | Precompute derived fields at write time |
| [preallocation.md](preallocation.md) | Pre-size arrays or counters for known cardinality |
| [outlier.md](outlier.md) | Split heavy outlier children from typical embeds |
| [bucket.md](bucket.md) | Group time-series measurements into bucket documents |
| [time-series.md](time-series.md) | Native MongoDB time series collections |
| [tree.md](tree.md) | Adjacency / materialized path hierarchies without recursive JOINs |
| [archive.md](archive.md) | Hot vs cold tier split for historical data |
| [schema-versioning.md](schema-versioning.md) | Dual-schema migrations with version discriminators |
| [polymorphic.md](polymorphic.md) | Single-table inheritance detection (`isPolymorphicTable`: `*_type` + ≥2 nullable payload columns) and MongoDB polymorphic modeling |
| [mongodb-inheritance-schema-pattern.md](mongodb-inheritance-schema-pattern.md) | MongoDB Inheritance Schema Pattern — discriminator-based subtypes, reverse ETL to relational/columnar sinks, and CDC from change streams |
| [single-collection.md](single-collection.md) | Peer entities in one collection with `docType` and `links[]` |

## Usage in the repo

- **Design engine** — Pattern ids in `src/design/patternSelector.ts` map to these docs via RAG retrieval.
- **Examples** — Seeded domains and dialect demos exercise patterns; see [examples/README.md](../examples/README.md).
- **Documentation map** — Broader module docs in [docs/README.md](../docs/README.md).
