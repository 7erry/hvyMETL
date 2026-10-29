# TODO

## Internationalization

Languages: English (default), Portuguese, Spanish, Simplified Chinese, Hindi.

**Done (studio chrome):** zero-dependency i18n in `web/src/i18n/` — locale picker (nav + auth), catalogs for all five languages; nav rail, auth gate, cookie consent, schema import modal/panel, live-agent form, status footer, migration workflow bar, schema phase toggle, diagram view selector, developer schema sidebar.

**Still English (wire `t('…')`):**

- [ ] Manager / Sizing deep panels
- [ ] Copilot chat copy
- [ ] Pipeline modal body
- [ ] Mongo Shell strings
- [ ] Dynamic `setStatus(…)` sentences in `App.tsx`

## Agent / live sources

Wave A (MongoDB, PostgreSQL, MySQL, MSSQL, SQLite — WSS schema + restartable extract) shipped in **10.0.0**. See [docs/27-agent-10.0-roadmap.md](docs/27-agent-10.0-roadmap.md).

**Wave B+ live schema + extract** (DDL paste only today):

- [ ] Oracle
- [ ] Db2
- [ ] SAP ASE
- [ ] ClickHouse
- [ ] Snowflake
- [ ] BigQuery
- [ ] Spanner
- [ ] Databricks
- [ ] DynamoDB
- [ ] HANA
- [ ] Teradata
- [ ] Firebird

**Cutover / legacy:**

- [ ] Remove deprecated HTTP poll agent (`GET /api/agent/next`, `POST /api/agent/result`, Rust `--http`)

**Explicit non-goals (track only):**

- [ ] CDC / bidirectional sync
- [ ] Inbound agent listener (studio → agent)

## Copilot / Grove security

Phase 0 shipped in **4.3.0** ([docs/25-copilot-security.md](docs/25-copilot-security.md)). Remaining:

- [ ] Phase 1 — server-owned chat sessions (stop trusting client `assistant` history)
- [ ] Phase 2 — tool policy engine; confirmation gates for workflow and index mutations
- [ ] Phase 3 — indirect injection hardening; aggregation stage allowlist review
- [ ] Phase 4 — Grove timeouts, unified HTTP client, cost caps, anomaly alerts
- [ ] Wire **Atlas Connectivity Architect** Grove preset ([docs/23-atlas-connectivity-architect.md](docs/23-atlas-connectivity-architect.md))
- [ ] Grove-backed HA assistant chat (today: status stub only — [docs/23-high-availability-agent.md](docs/23-high-availability-agent.md))

## ML / lessons learned

- [ ] Phase 4 — Atlas `$vectorSearch` on `hvymetl_lessons_learned` (feature flag, vector index, backfill, docs/env) — [docs/22-release-4.0-roadmap.md](docs/22-release-4.0-roadmap.md); today: in-process cosine

## Design engine

- [ ] Automate **Approximation** pattern (needs application-level statistical writes)
- [ ] Automate **Document Versioning** pattern (revision history model)
