# hvyMETL — Architecture Diagrams

Visual reference for the **H**igh **V**olume **M**ongoDB **ETL** pipeline. All diagrams
render in GitHub Markdown and in the [docs index](README.md).

Pattern semantics are grounded in MongoDB's
[Building with Patterns series](https://www.mongodb.com/company/blog/building-with-patterns-a-summary).

All diagrams use the official MongoDB **LeafyGreen** dark palette
([mongodb.design palette](https://www.mongodb.design/foundations/palette),
[@leafygreen-ui/palette](https://github.com/mongodb/leafygreen-ui/tree/main/packages/palette)):

| Token | Hex | Role in diagrams |
| --- | --- | --- |
| MongoDB Black | `#001E2B` | Canvas / page background |
| Gray Dark 4 | `#112733` | Subgraph (cluster) background |
| Green Dark 3 | `#023430` | Primary node background |
| Green Dark 2 | `#00684A` | Secondary nodes / actors |
| MongoDB Green | `#00ED64` | Borders, edges, titles |
| Spring Green | `#E3FCF7` | Labels and body text |

Re-apply after editing: `node scripts/apply-mermaid-theme.mjs`

---

## 1. End-to-end migration workflow

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
flowchart TB
    subgraph inputs [Inputs]
        SQL[(SQL source<br/>SQLite / adapter)]
        PROFILE[Workload profile<br/>R:W · RPM · growth]
        KB[knowledge/*.md<br/>11 pattern docs]
    end

    subgraph stage1 [Stage 1 — Design]
        INTRO[introspect DDL<br/>FKs · row counts · skew]
        RAG[RAG retrieve<br/>BM25 or vector]
        PLAN[buildMigrationPlan]
        ART1[migration-plan.json]
        ART2[design-report.md]
        INTRO --> PLAN
        RAG --> PLAN
        PROFILE --> PLAN
        SQL --> INTRO
        KB --> RAG
        PLAN --> ART1
        PLAN --> ART2
    end

    subgraph stage2 [Stage 2 — ETL]
        SPLIT[range / time splits<br/>max 8 workers]
        SHAPE[SQL shaping layer<br/>joins · JSON arrays · buckets]
        CSV[pattern-shaped CSV chunks]
        MAN[etl-manifest.json]
        ART1 --> SPLIT
        SPLIT --> SHAPE
        SQL --> SHAPE
        SHAPE --> CSV
        CSV --> MAN
    end

    subgraph stage3 [Stage 3 — Import]
        ANALYZE{--analyze?}
        MERGE[buildDocuments<br/>partitions · join · embed]
        UPSERT[bulk replaceOne upsert<br/>by deterministic _id]
        ATLAS[(MongoDB Atlas)]
        CSV --> ANALYZE
        ANALYZE -->|no| MERGE
        MERGE --> UPSERT
        UPSERT --> ATLAS
    end

    subgraph stage4 [Stage 4 — Repogen]
        REPO[mongoClient.ts<br/>repositories/*.ts<br/>ensureIndexes.ts]
        ART1 --> REPO
        PROFILE --> REPO
    end

    subgraph optional [Optional — Prompts]
        PROMPT[prompt bundle<br/>3 RAG-grounded .md files]
        KB --> PROMPT
        PROFILE --> PROMPT
        SQL --> PROMPT
    end

    REPO --> APP[Application layer]
    ATLAS --> APP
```

---

## 2. CLI command sequence

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
sequenceDiagram
    actor Dev as Developer
    participant CLI as hvymetl CLI
    participant Design as design engine
    participant ETL as parallel ETL
    participant Import as csvToAtlas
    participant Repo as repogen

    Dev->>CLI: seed-examples
    CLI-->>Dev: examples/*.db

    Dev->>CLI: design --source --profile --out
    CLI->>Design: introspect + RAG + plan
    Design-->>Dev: migration-plan.json, design-report.md

    Dev->>CLI: etl --plan --dry-run
    CLI->>ETL: 3 chunks × 1,000 rows
    ETL-->>Dev: structural validation log

    Dev->>CLI: etl --plan
    CLI->>ETL: up to 8 workers, non-overlapping ranges
    ETL-->>Dev: csv/*.chunkN.csv, etl-manifest.json

    Dev->>Import: import-cli chunk*.csv collection
    Import-->>Dev: upsert counts, index recommendations

    Dev->>CLI: repogen --plan --out
    CLI->>Repo: generate typed repositories
    Repo-->>Dev: repositories/*.ts

    opt LLM-assisted review
        Dev->>CLI: prompt --source --profile
        CLI-->>Dev: prompts/1-schema-design-architect.md …
    end
```

---

## 3. RAG retrieval flow

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
flowchart LR
    subgraph kb [Knowledge base]
        MD1[bucket.md]
        MD2[subset.md]
        MD3[extended-reference.md]
        MDN[… 8 more]
    end

    CHUNK[chunker<br/>split on ## headings]
    QUERY[buildRetrievalQuery<br/>profile + telemetry + patterns]

  MD1 & MD2 & MD3 & MDN --> CHUNK

    CHUNK --> CHUNKS[("Knowledge chunks")]

    QUERY --> RET{MONGODB_MODEL_KEY?}

    RET -->|yes| BM25H[BM25 keyword rank]
    RET -->|yes| VOY[Voyage 4 embed<br/>query + document]
    VOY --> COS[cosine similarity rank]
    BM25H --> RRF[Reciprocal Rank Fusion<br/>k=60]
    COS --> RRF
    RRF --> TOP[top-K chunks]

    RET -->|no| OPENAI{OPENAI_API_KEY?}
    OPENAI -->|yes| EMB[OpenAI embed batch]
    EMB --> VEC[cosine rank]
    VEC --> TOP
    OPENAI -->|no| BM25[BM25 only default]
    BM25 --> TOP

    RRF -.->|API failure| BM25
    VEC -.->|API failure| BM25

    TOP --> REPORT[design-report.md citations]
    TOP --> PROMPTS[3 production prompts]
```

---

## 4. Design engine decision flow

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
flowchart TD
    START([For each SQL table]) --> CLASSIFY{classify table}

    CLASSIFY -->|EAV key/value| ATTR[Attribute pattern<br/>attributes array]
    CLASSIFY -->|junction 2 FKs| JUNC[embed id array]
    CLASSIFY -->|firehose ≥10k rows<br/>+ write-heavy| BUCKET[Bucket collection<br/>time windows]
    CLASSIFY -->|default| CHILD{child relationships}

    CHILD -->|hub table referenced elsewhere| REF1[Reference only]
    CHILD -->|multiple parents| REF2[Reference + Computed counter]
    CHILD -->|measured bounded max ≤100/parent<br/>+ read-heavy| EMBED[Full embed<br/>drop child collection]
    CHILD -->|developer override max 1-5000/parent| EMBED
    CHILD -->|unbounded + skew<br/>+ read-heavy| SUBSET[Subset cap 10<br/>+ overflow collection]
    SUBSET --> OUTLIER{max/avg ≥ 10<br/>and max ≥ 50?}
    OUTLIER -->|yes| OUT[Outlier flag]
    OUTLIER -->|no| LOOKUP
    CHILD -->|unbounded + write-heavy| REF3[Reference]

    START --> LOOKUP{FK to small lookup<br/>≤5k rows?}
    LOOKUP -->|read-heavy| EXT[Extended Reference<br/>≤3 hot columns]
    LOOKUP -->|else| TREE

    START --> TREE{self-referencing FK?}
    TREE -->|yes| TREE_P[Tree parentId index]
    TREE -->|no| POLY

    START --> POLY{type column +<br/>sparse variants?}
    POLY -->|yes| POLY_P[Polymorphic metadata]
    POLY -->|no| SCHEMA

    ATTR & JUNC & BUCKET & REF1 & REF2 & EMBED & SUBSET & OUT & REF3 & EXT & TREE_P & POLY_P --> SCHEMA[Schema Versioning<br/>schemaVersion: 1]
    SCHEMA --> EMIT([Emit CollectionPlan])
```

---

## 5. SQL → MongoDB schema transformation (catalog example)

Relational source on the left; pattern-driven MongoDB layout on the right.

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
erDiagram
    brands ||--o{ products : "brand_id"
    categories ||--o{ categories : "parent_id"
    products ||--o{ product_attributes : "product_id"
    products ||--o{ reviews : "product_id"
    products ||--o{ product_variants : "product_id"
    products ||--o{ inventory_levels : "product_id"

    brands {
        int id PK
        string name
        string country
    }
    products {
        int id PK
        int brand_id FK
        string name
        int category_id FK
    }
    product_attributes {
        int product_id FK
        string attr_key
        string attr_value
    }
    reviews {
        int id PK
        int product_id FK
        int rating
        string title
    }
```

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
flowchart LR
    subgraph sql [SQL — normalized]
        T1[brands]
        T2[products]
        T3[product_attributes]
        T4[reviews]
        T5[reviews overflow]
    end

    subgraph mongo [MongoDB — pattern-shaped]
        C1[brands<br/>+ totalProducts Computed]
        C2[products<br/>+ brand Extended Ref<br/>+ attributes Attribute<br/>+ recentReviews Subset<br/>+ totalReviews Computed]
        C3[reviews<br/>overflow collection]
    end

    T1 --> C1
    T2 --> C2
    T3 -.->|embedded array| C2
    T4 -.->|subset 10 newest| C2
    T4 -->|full history| C3
    T1 -.->|name country website| C2
```

---

## 6. `migration-plan.json` structure

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
classDiagram
    class MigrationPlan {
        +string source
        +string profileId
        +WorkloadTelemetry telemetry
        +WriteConcernSetting writeConcern
        +PoolSettings pool
        +string generatedAt
        +CollectionPlan[] collections
    }

    class CollectionPlan {
        +string name
        +string sourceTable
        +string[] mergedTables
        +IdDerivation idDerivation
        +PatternDecision[] patterns
        +JsonSchema jsonSchema
        +IndexSpec[] indexes
        +EmbeddedArraySpec[] embeddedArrays
        +ExtendedReferenceSpec[] extendedReferences
        +ComputedFieldSpec[] computedFields
        +BucketSpec bucket
    }

    class IdDerivation {
        +string[] sourceColumns
        +direct | composite | bucket strategy
    }

    class PatternDecision {
        +PatternId pattern
        +string target
        +string reason
        +string knowledgeSource
    }

    class EmbeddedArraySpec {
        +string field
        +string sourceTable
        +string joinColumn
        +int subsetLimit
        +string overflowCollection
    }

    class ExtendedReferenceSpec {
        +string field
        +string sourceTable
        +string viaColumn
        +string[] lookupColumns
    }

    class BucketSpec {
        +string windowColumn
        +int windowMinutes
        +string groupByColumn
        +string measurementsField
    }

    MigrationPlan "1" --> "*" CollectionPlan
    CollectionPlan --> IdDerivation
    CollectionPlan --> PatternDecision
    CollectionPlan --> EmbeddedArraySpec
    CollectionPlan --> ExtendedReferenceSpec
    CollectionPlan --> BucketSpec
```

Example excerpt (products collection):

```json
{
  "name": "products",
  "idDerivation": { "sourceColumns": ["id"], "strategy": "direct" },
  "patterns": [
    { "pattern": "extended-reference", "target": "products.brand", "knowledgeSource": "extended-reference.md" },
    { "pattern": "subset", "target": "products.recentReviews", "knowledgeSource": "subset.md" },
    { "pattern": "attribute", "target": "products.attributes", "knowledgeSource": "attribute.md" }
  ],
  "embeddedArrays": [
    { "field": "recentReviews", "subsetLimit": 10, "overflowCollection": "reviews" }
  ],
  "extendedReferences": [
    { "field": "brand", "lookupColumns": ["name", "country", "website"] }
  ]
}
```

---

## 7. Parallel ETL worker pool

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
flowchart TB
    RUN[runEtl] --> READ[read migration-plan.json]
    READ --> PER_COLL{for each collection}

    PER_COLL --> RANGE{split strategy}
    RANGE -->|numeric PK| PK[splitRange<br/>half-open start end]
    RANGE -->|bucket| TIME[splitTimeRangeAligned<br/>window-aligned epochs]

    PK & TIME --> QUEUE[(task queue)]
    QUEUE --> W1[Worker 1]
    QUEUE --> W2[Worker 2]
    QUEUE --> WN[Worker … up to 8]

    subgraph worker [Per-worker loop]
        OPEN[open SQLite read-only]
        EXEC[execute shaped SELECT<br/>WHERE splitColumn in range]
        DERIVE[deriveId from __idPartN]
        STREAM[stream formatCsvRow<br/>backpressure on drain]
        OPEN --> EXEC --> DERIVE --> STREAM
    end

    W1 & W2 & WN --> worker
    STREAM --> FILES[collection.chunkN.csv]
    FILES --> MANIFEST[etl-manifest.json]
```

**Dry-run gate:** `DRY_RUN=true` or `--dry-run` → exactly 3 chunks × 1,000 rows per
collection with structural validation only.

---

## 8. CSV → MongoDB document modeling

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
flowchart LR
    subgraph csv [CSV headers]
        H1["_id"]
        H2["brand.name"]
        H3["recentReviews[]"]
        H4["totalReviews"]
    end

    subgraph coerce [coerce.ts]
        SCALAR[scalar coercion<br/>number bool JSON null]
        NEST[setPath dotted keys<br/>nested objects]
        ARRAY[setPath indexed keys<br/>items.0.sku]
        JSONARR[parse JSON array cells]
    end

    subgraph doc [MongoDB document]
        D1["_id: string"]
        D2["brand: { name }"]
        D3["recentReviews: [...]"]
        D4["totalReviews: number"]
    end

    H1 --> SCALAR --> D1
    H2 --> NEST --> D2
    H3 --> JSONARR --> D3
    H4 --> SCALAR --> D4
```

Deterministic `_id` derivation:

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
flowchart LR
    PK[SQL primary key parts] --> JOIN["join with | separator"]
    JOIN --> ID["_id string"]
    ID --> UPSERT["replaceOne filter upsert true"]
    UPSERT --> SAFE[Idempotent under<br/>parallel chunk imports]
```

| Strategy | `_id` example | When |
| --- | --- | --- |
| `direct` | `"42"` | Single-column PK |
| `composite` | `"7\|2026-01-01"` | Multi-column PK or bucket group key |
| `bucket` | `"deviceId\|windowStart"` | Time-window bucket documents |

---

## 9. csvToAtlas merge modes

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
flowchart TD
    FILES[Input CSV file set] --> ANALYZE[analyzeCsvFiles]

    ANALYZE --> MODE{merge mode}

    MODE -->|1 file or identical headers| PART[partitions mode<br/>concatenate rows]
    MODE -->|different shapes + join field| JOIN[join mode<br/>merge by key]
    MODE -->|parent + embed specs| EMBED[embed mode<br/>nest child arrays]

    PART --> DOC[buildDocuments]
    JOIN --> DOC
    EMBED --> DOC

    DOC --> BULK[bulkWrite batches of 1000<br/>unordered]
    BULK --> RESULT[ImportResult JSON<br/>counts · indexes · schemaSummary]
```

---

## 10. Generated repository atomic operations

Read-modify-write loops are forbidden; each pattern maps to one server-side modifier.

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
flowchart LR
    subgraph patterns [Pattern maintainers]
        COMP[Computed<br/>$inc counter]
        SUB[Subset<br/>$push $each $position 0 $slice N]
        BUCK[Bucket<br/>$setOnInsert + $push + $inc]
        EXT[Extended Reference<br/>updateMany fan-out]
    end

    subgraph forbidden [Not generated]
        RMW[read document<br/>modify in app<br/>write back]
    end

    RMW -.->|blocked by design| X[✗]
    COMP & SUB & BUCK & EXT --> ATLAS[(MongoDB)]
```

---

## 11. Workload profile → tuning mapping

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
flowchart TD
    P[WorkloadProfile] --> TEL[telemetry]
    P --> WC[writeConcern]
    P --> POOL[pool settings]
    P --> PREF[preferredPatterns]

    TEL --> DESIGN[design engine<br/>pattern gating]
    PREF --> RAG[RAG retrieval query]
    WC --> CLIENT[generated mongoClient.ts]
    POOL --> CLIENT
    WC --> IMPORT[import-cli --write-concern]

    TEL -->|read ≥ 70%| READ[embed · subset · extended-ref · computed]
    TEL -->|write ≥ 60%| WRITE[bucket · reference]
    TEL -->|peakRpm ≥ 100k| BIGPOOL[large maxPoolSize]
    TEL -->|critical / ledger| MAJ[w majority + journal]
```

---

## 12. Example domain coverage

```mermaid
%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%
mindmap
  root((hvyMETL examples))
    catalog
      Extended Reference
      Subset + Outlier
      Attribute EAV
      Computed
      Tree
    cms
      Polymorphic blocks
      Tree pages
      Junction tags
    iot
      Bucket 60k readings
      Computed
      Reference
    mobile
      Bucket events
      Subset sessions
    personalization
      Attribute traits
      Multi-parent affinities
    analytics
      Bucket firehose
      Pre-allocation rollups
    singleview
      Customer 360 fan-in
      Subset orders
```
