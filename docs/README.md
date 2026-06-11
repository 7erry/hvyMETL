# hvyMETL Documentation

**hvyMETL** (**H**igh **V**olume **M**ongoDB **ETL**) is a RAG-driven SQL-to-MongoDB
migration toolkit. It grounds every schema decision in a retrievable knowledge base of
MongoDB schema design patterns and the application's workload telemetry (read:write
ratio, peak RPM, data growth), then executes a parallel, pattern-aware ETL into
MongoDB Atlas and generates a concurrency-safe data access layer.

This documentation set follows one consistent template per module: high-level summary,
technical signatures, edge cases, conceptual code breakdown, usage example, and
refactoring notes.

**Visual reference:** [diagrams.md](diagrams.md) — Mermaid workflow, schema
transformation, `migration-plan.json` structure, ETL concurrency, CSV modeling, and
merge-mode diagrams.

## Document Map

| Document | Covers | Source |
| --- | --- | --- |
| [01-cli.md](01-cli.md) | The `hvymetl` command-line interface and runtime profile selection | `src/cli.ts` |
| [02-profiles.md](02-profiles.md) | Workload telemetry profiles, write concern, and pool tuning | `src/profiles/profiles.ts` |
| [03-knowledge-rag.md](03-knowledge-rag.md) | Pattern knowledge base, BM25 / hybrid RRF retrieval, prompt bundles | `knowledge/`, `src/rag/` |
| [12-validate-hybrid-rag.md](12-validate-hybrid-rag.md) | Validate MongoDB Model Key + hybrid BM25 + Voyage 4 + RRF | `scripts/validate-hybrid-rag.mjs` |
| [13-web-ui.md](13-web-ui.md) | Optional MongoDB-branded Migration Studio (ER diagrams, templates, AI export) | `web/`, `src/server/` |
| [04-adapters.md](04-adapters.md) | The pluggable SQL source adapter and SQLite implementation | `src/adapters/` |
| [05-design-engine.md](05-design-engine.md) | Introspection-to-pattern decision engine and `migration-plan.json` | `src/design/` |
| [06-etl.md](06-etl.md) | Parallel worker-thread extraction, range splitting, CSV shaping | `src/etl/` |
| [07-import-cli.md](07-import-cli.md) | The csvToAtlas import CLI: analysis, merging, idempotent upserts | `src/import/` |
| [08-repogen.md](08-repogen.md) | Generated repository layer with atomic modifiers | `src/repogen/` |
| [09-utilities.md](09-utilities.md) | CSV dialect, deterministic ids, naming conversions | `src/utilities/` |
| [10-examples.md](10-examples.md) | The seven example SQL domains and the deterministic seeder | `examples/`, `src/examples/` |
| [11-run-all-examples.md](11-run-all-examples.md) | End-to-end Atlas run for all seven domains with automated validation | `scripts/run-all-examples.mjs` |

## Architectural Role

hvyMETL is a CLI toolchain (not a service). Its five stages communicate through
artifacts on disk, so each stage can be run, inspected, and re-run independently:

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
flowchart LR
    subgraph inputs [Inputs]
        SQL[(SQL source)]
        Profile[Workload profile]
        KB[knowledge/*.md]
    end
    subgraph stages [Pipeline Stages]
        Design[design engine]
        Etl[parallel ETL]
        Import[csvToAtlas import]
        Repogen[repository generator]
    end
    KB -->|"RAG retrieval"| Design
    SQL --> Design
    Profile --> Design
    Design -->|"migration-plan.json"| Etl
    Etl -->|"pattern-shaped CSV chunks"| Import
    Import --> Atlas[(MongoDB Atlas)]
    Design -->|"migration-plan.json"| Repogen
    Repogen -->|"typed repositories"| App[Application code]
```

## Design Pattern References

The decision rules in the design engine and the documents in `knowledge/` are grounded
in MongoDB's official **Building with Patterns** series. The summary article —
[Building with Patterns: A Summary](https://www.mongodb.com/company/blog/building-with-patterns-a-summary)
— recaps each pattern's problem, benefits, and trade-offs, and is the recommended
starting point for understanding *why* the design engine makes the choices it makes.

| hvyMETL `PatternId` | Knowledge doc | MongoDB series pattern | Trade-off noted by MongoDB |
| --- | --- | --- | --- |
| `attribute` | `knowledge/attribute.md` | Attribute | Fewer indexes, simpler queries; reshaped field access |
| `computed` | `knowledge/computed.md` | Computed | Less CPU on reads; risk of overuse, slight staleness |
| `extended-reference` | `knowledge/extended-reference.md` | Extended Reference | Fewer JOINs/$lookups; data duplication to maintain |
| `outlier` | `knowledge/outlier.md` | Outlier | Typical case stays fast; outlier handling lives in app code |
| `preallocation` | `knowledge/preallocation.md` | Pre-allocation | Simpler known structures; trades space for performance |
| `polymorphic` | `knowledge/polymorphic.md` | Polymorphic | Single-collection queries across similar shapes |
| `schema-versioning` | `knowledge/schema-versioning.md` | Schema Versioning | Zero-downtime migrations; transient dual indexes |
| `subset` | `knowledge/subset.md` | Subset | Smaller working set; the subset must be managed |
| `tree` | `knowledge/tree.md` | Tree | No recursive JOINs; app-managed graph updates |
| `bucket` | `knowledge/bucket.md` | Bucket (same series) | Far fewer documents/index entries for time-series |
| `embed` / `reference` | `knowledge/embed-vs-reference.md` | Foundational modeling guidance | Locality vs. unbounded growth (16MB limit) |

Two patterns from the series are intentionally **not** automated: *Approximation*
(requires application-level statistical writes) and *Document Versioning* (a revision
history requirement the structural model cannot infer). Both are candidates for future
rules; see the refactoring notes in [05-design-engine.md](05-design-engine.md).

## Quick Start

```bash
npm install && npm run build
npm run seed-examples
npm run hvymetl -- design --source examples/iot.db --profile iot --out out/iot
npm run hvymetl -- etl --plan out/iot/migration-plan.json --out out/iot --dry-run
```

### Optional: hybrid RAG with MongoDB Model Key

```bash
# Add MONGODB_MODEL_KEY to .env (Atlas → AI Services → Models → API Keys)
npm run validate-hybrid-rag
```

See [12-validate-hybrid-rag.md](12-validate-hybrid-rag.md) and [03-knowledge-rag.md](03-knowledge-rag.md).

See the root [README.md](../README.md) for the complete end-to-end walkthrough.
