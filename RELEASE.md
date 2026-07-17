## hvyMETL 1.7.1

Patch release for hosted Migration Studio CSV uploads, pipeline reliability, Atlas Logs, and studio UX fixes since 1.7.0.

### Highlights

- **CSV pipeline uploads:** clearer errors when API responses are HTML instead of JSON; validate CSV filenames against imported SQL tables (e.g. warn on non-table exports).
- **HTTP 413 fixes:** upload CSVs one file at a time; auto-split files over ~900 KB into `*.chunkN.csv` parts before upload (fits common 1 MB reverse-proxy limits).
- **MongoDB Atlas Logs** in Manager View via Atlas Admin API (snapshot, project events, log download) with egress IP and hostname validation guidance.
- **Auth UX:** friendlier session-expired re-login flow; Swagger UI auth fixes on Express 5 and new-tab `access_token` links.
- **Pipeline dialog:** fix config refresh loop / endless loading; keep **Done** label after success; hide csvToAtlas path when configured in server `.env`; per-user pipeline secrets and downloadable zip results on hosted studio.
- **Design:** more aggressive SQL child-table embedding; diagram footer legend icons aligned with collection field glyphs; inline collapsible legends.
- **Dialects:** SAP ASE (Sybase) DDL import support.

### Verification

- `npm test`
- `npm run build`
- `npm run build --prefix web`

---

## hvyMETL 1.7.0

Hosted Migration Studio release: Auth0 login on [hvymetl.studio](https://hvymetl.studio), per-user tenant isolation, and production auth fallbacks when Auth0 Login Actions are still being wired up.

### Highlights

- Auth0 SPA login with developer/manager/admin roles, Terms page, and mobile-friendly layout.
- Multi-tenant isolation: per-user uploads, artifacts, workspace settings, and pipeline history scoped by Auth0 `sub`.
- Hosted auth config via `GET /api/auth/config` and `GET /api/auth/me` (no build-time `VITE_AUTH0_*` required when `AUTH0_SPA_CLIENT_ID` is set on the server).
- Server role fallbacks: default `developer` for signed-in users without JWT role claims; `HVYMETL_ADMIN_SUBS` bootstrap for admins.
- Auth0 setup walkthrough in `web/README.md`; Atlas egress IP guidance for hosted pipeline runs.
- Fix pipeline settings inputs (MongoDB URI, csvToAtlas path) resetting after each keystroke.

### Verification

- `npm test`
- `npm run build`
- `npm run build --prefix web`

---

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
