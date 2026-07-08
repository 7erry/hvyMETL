## hvyMETL 1.0.0

The 1.0 release formalizes hvyMETL Migration Studio as a complete SQL-to-MongoDB migration planning and execution workflow.

### Highlights

- Visual schema import, Before/After diagrams, manager review, cost projection, and migration readiness workflows.
- Pattern-driven design engine with RAG/ML-enhanced reports, API artifacts, and repository generation.
- Full pipeline execution through mock or exported CSV data, CSV shaping for embedded arrays, csvToAtlas import, MongoDB persistence, and feedback logging.
- Developer Embed Overrides for DDL-only design: max cardinality hints and explicit force-embed controls for linked FK relationships.
- Manager cost center with Atlas sizing, storage/archive savings, and manpower savings estimates.

### Verification

- `npm test -- web/src/cardinalityOverrides.test.ts src/design/patternSelector.test.ts src/server/runDesign.test.ts`
- `npm run build`
- `npm run build --prefix web`
