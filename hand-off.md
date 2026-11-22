# Hand-off — Regal Park CRM

**Goal:** white-labelled (Sterlitee Regal Park) TypeScript real-estate CRM modelled on the Perfex Real Estate module, JSON storage, Indian mock data, 6 roles with RBAC, roles page to view the app as any role. Spec: `docs/PLAN.md` (§1–9). Todo: `todo.md`. ADRs: `architecture-record-document.md` (ADR-1…7). Run instructions: `README.md`.

**State (2026-11-22):** Phases 0–3 + roles page complete and committed. Final Haiku gate GREEN: tsc clean, 2,660/2,660 tests, vite build OK. Browser-verified all pages as admin and role switching to owner/client; API scoping verified for all 6 roles.
**Deployed (ADR-8):** public repo https://github.com/vjk7989/regal-park-crm, live site https://vjk7989.github.io/regal-park-crm/ (GitHub Pages via .github/workflows/pages.yml on every push to main: npm ci → typecheck → 2,211 tests → build:pages → deploy). The hosted build runs the same API core (server/core.ts) in the browser with data in localStorage (client/localApi.ts); local dev still uses Express.
**Phase 5 (ADR-9):** full Perfex suite — 56 registry modules (shared/modules/*.ts), 302 entities, 2,927 Indian mock records (seed.json 1.1 MB), generic engine server/xcore.ts + client/pages/module/*, Perfex-style main dashboard (server/overview.ts, client/pages/Overview.tsx), Real Estate dashboard at /real-estate. Gate GREEN: 2,673 tests. Live redeployed and verified; browser data reseeds automatically when seedVersion changes. Authoring rules: docs/AUTHORING.md; catalogue: docs/MODULES.md.
**In flight:** nothing. **Open:** none.
**Pipeline:** Opus orchestrator (main session) plans + keeps docs; lean-developer (Sonnet) ×3 (D1 server/dashboard/reports/settings, D2 properties/approvals/requests, D3 shell/components/people/leads/billing/roles); lean-test-writer (Opus); lean-test-runner (Haiku). Fix before next task.
**Gate:** `npm run typecheck && npm test && npm run build`.
**Run:** `npm run dev` → http://localhost:5173 (API 4000; server reads API_PORT, never PORT). `.claude/launch.json` config "regal-park-crm" starts it in the app's browser pane.
**Gotchas:**
- Vite's file watcher on this Windows box occasionally misses edits; `touch` the file or restart the dev server if the browser shows stale code.
- `data/db.json` is runtime state (gitignored); delete it or use Settings → Data → Reset to return to the seed.
- Demo passwords are `demo123` (local test values).
- User excluded Zoho, Xero, Support; map widget replaced by a Google Maps link.
- Supplier/Affiliate portals from the GTS screenshot were not added (not part of the real-estate module); ask user if wanted.
- Known non-blocking notes: PropertyDetail own-name fallback applies on any failed lookup (not only 403); bundle >500 kB warning.
**Next step:** await user's next task. Optional: bump GitHub Actions to Node-24-native versions when released (current run shows Node 20 deprecation warnings only).
