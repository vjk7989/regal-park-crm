# Hand-off — Regal Park CRM

**Goal:** white-labelled (Sterlitee Regal Park) TypeScript real-estate CRM modelled on the Perfex Real Estate module, JSON storage, Indian mock data, 6 roles with RBAC. Spec: `docs/PLAN.md`. Todo: `todo.md`. ADRs: `architecture-record-document.md`.

**State:** Phase 0 done (discovery + plan). Phase 1 starting with 3 Sonnet developers.
**Resources:** cpu 16 logical (load 70%), ram free 4.0/15.4 GB, GTX 1650 → developers 3, heavy jobs 1.
**Pipeline:** Opus orchestrator (main session) plans + keeps docs; lean-developer (Sonnet) ×3; lean-test-writer (Opus); lean-test-runner (Haiku). Fix before next task.
**Gate:** `npm run typecheck && npm test && npm run build` (at repo root G:\equinox-22).
**Run app:** `npm run dev` → client http://localhost:5173, API http://localhost:4000. Demo logins in PLAN §6 (password demo123, quick-login buttons on /login).
**Gotchas:** user excluded Zoho, Xero, Support. Reference admin demo: perfexmodules.gtssolution.site/admin/realestate/* (user's Chrome session). Missing tools: code graph not indexed for this new repo (graph skipped: new repo, files named in briefs).
**Next step:** spawn D1 (T1→T3), D2 (T2→T4), D3 (T5→T6).
