# 26 — Effort estimate

Snapshot of **hvyMETL 5.1.37** (git history 11 Jun 2026 through 5 Oct 2026).
These hours rebuild the product as it stands: CLI pipeline, Migration Studio,
and copilot. Later releases add hours on top of this baseline.

**Planning number: 1,300 person-hours** (about **8.1 person-months** at 160 hours).
Use **900–1,800 hours** as the uncertainty band.

| Lens | Hours | What it means |
| --- | ---: | --- |
| Planning estimate | **1,300** | Senior who already knows SQL-to-MongoDB modeling and works with a coding agent |
| Likely time already spent | **~550** | One author over four calendar months, inferred from commit history |
| Traditional team | **2,760** | Same scope at a normal review cadence (band **2,400–3,200**) |
| Git floor | **130** | Clock time from the first commit to the last commit on each active day |

The external [csvToAtlas](https://github.com/7erry/cvsToAtlas) tool is a dependency
of the import stage. Its implementation is outside this repository and is excluded.

## Where the 1,300 hours go

| Group | Hours | Share |
| --- | ---: | ---: |
| Schema import and design engine | 260 | 20% |
| ETL, codegen, Atlas, API server | 270 | 21% |
| Migration Studio UI | 240 | 18% |
| Copilot | 220 | 17% |
| RAG and ML engine | 170 | 13% |
| Tests and docs | 140 | 11% |
| **Total** | **1,300** | **100%** |

## Subsystem breakdown

Line counts are approximate. A file is listed with the subsystem it mainly
serves. Test lines are a separate row so they are not counted twice.

| Area | Lines | Planning h | Traditional h | What it covers |
| --- | ---: | ---: | ---: | --- |
| Schema import, dialects, DDL | 6.5k | 120 | 300 | Dialect matrix, DDL parser, naming, CSV |
| Design engine | 2.6k | 140 | 350 | Pattern rules and `migration-plan.json` |
| Knowledge base and RAG | 2.2k | 80 | 176 | BM25, hybrid Voyage, RRF, prompt bundles |
| ML engine | 3.0k | 90 | 216 | Rerank, critic, lessons, reflection |
| Parallel ETL | 0.7k | 40 | 80 | Worker pool and pattern-shaped CSV |
| Repository codegen | 4.1k | 70 | 126 | Typed repositories in 13 languages |
| Atlas sizing, HA, logs, cost | 1.5k | 70 | 154 | Tiers, connectivity, manager cost |
| Copilot | 14.8k | 220 | 484 | Tools, inspect, architecture review, guards |
| Migration Studio UI | 34.6k | 240 | 480 | ER diagrams, manager, pipeline, theme CSS |
| API server, auth, hosting | 5.5k | 90 | 180 | Pipeline routes, Auth0, PM2 |
| Tests | 15.8k | 80 | 128 | 180 test files, mostly written with the feature |
| Docs, examples, releases | 13.3k | 60 | 90 | Module docs, knowledge, generators, `RELEASE.md` |
| **Total** |  | **1,300** | **2,760** |  |

`web/` line count includes `theme.css` (about 7.2k lines).

## What was counted

| Artifact | Lines | Files |
| --- | ---: | ---: |
| `src/` (production) | 36.1k | 208 |
| `web/` (production, including CSS) | 34.6k | 173 |
| Tests | 15.8k | 180 |
| Docs and knowledge | 10.5k | 56 |
| Example generators | 2.8k | 9 |
| **Hand-written total** | **~100k** |  |

Excluded from the line count: `node_modules`, `dist`, `package-lock.json`, and the
generated `out/` tree (about 171k lines).

## Git record

| Signal | Value |
| --- | --- |
| Author | One (Terry Walters) |
| Commits | 423 |
| Calendar span | 11 Jun 2026 – 5 Oct 2026 (about 4 months) |
| Days with at least one commit | 46 |
| Sum of first-to-last commit windows | about 130 hours |

Commits per month (October only through 5 Oct):

| Month | Commits |
| --- | ---: |
| Jun 2026 | 81 |
| Jul 2026 | 199 |
| Aug 2026 | 76 |
| Sep 2026 | 17 |
| Oct 2026 | 50 |

Commit windows are a floor. They omit reading, design, debugging, and any day
that did not end in a commit. Scaling those windows for uncommitted work lands
near **550 hours** of actual author time (about 3.4 person-months). That matches
a single specialist working in bursts across the four-month span. July is the
build-out peak.

## How the hours were set

Planning hours use about 15–50 finished lines per hour, depending on density:

- Slower for the design engine and the DDL parser, where each line encodes a modeling rule.
- Faster for Studio UI, CSS, codegen templates, tests, and docs.

Traditional hours apply a **1.5–2.5×** multiplier on the same breakdown. The
multiplier is higher where domain judgment dominates (design engine, dialects,
ML) and lower where templates and tests carry the volume (codegen, docs).

Figures are rounded to the nearest 10 hours. Treat **1,300** as the quote and
**900–1,800** as the uncertainty on that quote.

## Related docs

- Pipeline stages: [16-pipeline-steps.md](16-pipeline-steps.md)
- Migration Studio: [13-web-ui.md](13-web-ui.md)
- Copilot: [20-agent-copilot.md](20-agent-copilot.md)
- Release history: [RELEASE.md](../RELEASE.md)
