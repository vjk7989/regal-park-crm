# TODO — Regal Park CRM (spec: docs/PLAN.md)

Markers at line end: `[ ]` pending · `[.]` ongoing (note) · `[x]` done

## Phase 0 — discovery & plan
- P0.1 · Explore Perfex real-estate admin demo (12 pages, forms, statuses) [x]
- P0.2 · Read CodeCanyon roles + Sterlitee Regal Park branding [x]
- P0.3 · Write PLAN.md, todo, ADR, hand-off [x]

## Phase 1 — foundation (3 Sonnet devs in parallel, disjoint files)
- T1 · D1 · Project config: package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html, .gitignore; npm install [x]
- T2 · D2 · shared/types.ts, shared/permissions.ts, shared/format.ts [x]
- T3 · D1 · Server: server/index.ts, store.ts, auth.ts, scope.ts, routes.ts (+ domain.ts) — full §5 API [x]
- T4 · D2 · scripts/seed.ts → data/seed.json (§6 mock data) [x]
- T5 · D3 · Client shell: main.tsx, App.tsx, api.ts, auth.tsx, Layout.tsx, theme.css, Login.tsx + stub pages [x]
- T6 · D3 · Components: DataTable.tsx, FormModal.tsx, ui.tsx [x]
- T1-6.test · Opus test-writer: API/RBAC/scope/format/seed-integrity edge-case tests; Haiku runs gate (tests written: ui 116, shared+seed 995, server 571) — Haiku gate GREEN [x]

## Phase 2 — pages
- P1 · D1 · Dashboard.tsx [x]
- P2 · D1 · Reports.tsx [x]
- P9 · D1 · Settings.tsx (general, prefixes, plans, users, permissions, reset) [x]
- P3 · D2 · Properties.tsx, PropertyForm.tsx, PropertyDetail.tsx [x]
- P4 · D2 · Approvals.tsx [x]
- P7 · D2 · Requests.tsx, RequestDetail.tsx (buy + rent) [x]
- P5 · D3 · EntityPage.tsx + entities.ts (owners, staff, agents, brokers, clients) [x]
- P6 · D3 · Leads.tsx (table + kanban + convert) [x]
- P8 · D3 · Tenants.tsx, Billing.tsx (invoices + contracts) [x]
- P.test · Opus test-writer: UI tests per page (RBAC visibility, CRUD flows); Haiku runs gate — 1995 tests, Haiku gate GREEN [x]

## Phase 3 — verification
- V1 · Browser smoke test every page as each of the 6 roles, fix what breaks [x]
- V1.a · D1 · Dashboard lead data hidden for roles without leads view (server + UI); leads-by-source chart labels; lists newest first [x]
- V1.b · D2 · PropertyDetail: request button only on available props; readable hero badges; own name for self-links [x]
- V1.c · D3 · Tables: no-wrap cells + horizontal scroll, Actions column visible [x]
- V1.d · D1 · Server listened on generic PORT (clashed with Vite) → API_PORT||4000 [x]

## Phase 4 — user follow-ups (2026-11-22)
- R1 · D3 · Roles page (/roles): all 6 roles with access summary; click = view the app as that role; "Switch role" in topbar + link on login [x]
- H1 · Hosting: decide with user (local run vs GitHub repo + hosted deploy) [x]
- H1 decided: public repo + GitHub Pages via Actions, in-browser API (ADR-8) [x]
- S1 · D1 · server/core.ts framework-agnostic handleRequest + Store interface; express adapter; no node-only imports in core [x]
- S2 · D3 · client/localApi.ts (localStorage Store + sessions, seed import) + api.ts static switch + router basename + base-aware redirects [x]
- S3 · D2 · .github/workflows/pages.yml, vite base from env, 404.html, build:pages script [x]
- S4 · Orchestrator · create public repo vjk7989/regal-park-crm, push, enable Pages, verify live — live at https://vjk7989.github.io/regal-park-crm/ (run 44989496301 green, verified in browser) [x]
