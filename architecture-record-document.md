# Architecture Record — Regal Park CRM (append-only)

## ADR-1: Vite React SPA + Express API, both TypeScript  (2026-11-22, accepted)
User asked for TypeScript, simple CRUD, quick delivery. One npm package; `shared/` holds types + permission logic used by both sides so RBAC rules have one source.

## ADR-2: JSON file as the database  (2026-11-22, accepted)
User: "no database, use JSON". `data/seed.json` (committed, deterministic) is copied to `data/db.json` at first start; writes are synchronous temp-file + rename. Reset endpoint re-copies seed. Fine for a single-user demo; not for concurrency.

## ADR-3: RBAC = permission matrix + server-side record scoping  (2026-11-22, accepted)
Six roles modelled on the Perfex real-estate module portals (admin, staff, real-estate agent, business broker, property owner, client). Matrix (role × module × V/C/E/D) is editable in Settings and enforced on the server; "own records" scoping is server-side in `server/scope.ts`. Client hides what `can()` denies, but the server is the authority.

## ADR-4: Leads module added; Zoho/Xero/Support/map widget excluded  (2026-11-22, accepted)
Perfex module has no leads page, but the user asked for Indian real-estate leads; added a Leads pipeline. Excluded per user: Zoho, Xero, Support. Map view replaced by a Google Maps link (no map library / API key).

## ADR-5: Dependencies  (2026-11-22, accepted)
Runtime: react, react-dom, react-router-dom, recharts, lucide-react, express. Dev: vite, @vitejs/plugin-react, typescript, tsx, concurrently, vitest, supertest, jsdom, @testing-library/react, @testing-library/user-event, @types/*. No UI kit (keeps branding custom, bundle small).

## ADR-6: No worktrees; parallel devs own disjoint files in one tree  (2026-11-22, accepted)
New repo, 3 developers, every sub-task has a disjoint file set and only T1 touches package.json. Worktrees would add merge steps with no benefit. Only one heavy job (npm install / build / test) at a time.

## ADR-7: Role switcher for demos  (2026-11-22, accepted)
User asked for a page listing all roles where clicking a role shows the app as that role. Implemented as real logout + login as the role's demo user (no client-side impersonation), so every view is enforced by the same server RBAC. Sidebar gains an always-visible "All Roles" link; this supersedes the exact per-role sidebar lists asserted in tests/ui/layout-rbac.test.tsx (tests updated to the new spec).
