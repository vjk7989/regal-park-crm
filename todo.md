# TODO — Regal Park CRM (spec: docs/PLAN.md)

Markers at line end: `[ ]` pending · `[.]` ongoing (note) · `[x]` done

## Phase 0 — discovery & plan
- P0.1 · Explore Perfex real-estate admin demo (12 pages, forms, statuses) [x]
- P0.2 · Read CodeCanyon roles + Sterlitee Regal Park branding [x]
- P0.3 · Write PLAN.md, todo, ADR, hand-off [x]

## Phase 1 — foundation (3 Sonnet devs in parallel, disjoint files)
- T1 · D1 · Project config: package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html, .gitignore; npm install [ ]
- T2 · D2 · shared/types.ts, shared/permissions.ts, shared/format.ts [ ]
- T3 · D1 · Server: server/index.ts, store.ts, auth.ts, scope.ts, routes.ts (+ domain.ts) — full §5 API [ ]
- T4 · D2 · scripts/seed.ts → data/seed.json (§6 mock data) [ ]
- T5 · D3 · Client shell: main.tsx, App.tsx, api.ts, auth.tsx, Layout.tsx, theme.css, Login.tsx + stub pages [ ]
- T6 · D3 · Components: DataTable.tsx, FormModal.tsx, ui.tsx [ ]
- T1-6.test · Opus test-writer: API/RBAC/scope/format/seed-integrity edge-case tests; Haiku runs gate [ ]

## Phase 2 — pages
- P1 · D1 · Dashboard.tsx [ ]
- P2 · D1 · Reports.tsx [ ]
- P9 · D1 · Settings.tsx (general, prefixes, plans, users, permissions, reset) [ ]
- P3 · D2 · Properties.tsx, PropertyForm.tsx, PropertyDetail.tsx [ ]
- P4 · D2 · Approvals.tsx [ ]
- P7 · D2 · Requests.tsx, RequestDetail.tsx (buy + rent) [ ]
- P5 · D3 · EntityPage.tsx + entities.ts (owners, staff, agents, brokers, clients) [ ]
- P6 · D3 · Leads.tsx (table + kanban + convert) [ ]
- P8 · D3 · Tenants.tsx, Billing.tsx (invoices + contracts) [ ]
- P.test · Opus test-writer: UI tests per page (RBAC visibility, CRUD flows); Haiku runs gate [ ]

## Phase 3 — verification
- V1 · Browser smoke test every page as each of the 6 roles, fix what breaks [ ]
