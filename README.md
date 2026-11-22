# Regal Park CRM — Sterlitee Developers

White-labelled real-estate CRM for **Sterlitee Regal Park** (Neotown, Electronic City, Bengaluru), modelled on the Perfex "Real Estate Management" module. TypeScript end to end, JSON file storage, Indian mock data.

## Live demo
https://vjk7989.github.io/regal-park-crm/ — runs fully in the browser (data is stored in your browser; Settings → Data → Reset restores the demo data). Deployed by GitHub Actions on every push to `main` (`.github/workflows/pages.yml`).

## Run locally
```
npm install
npm run dev
```
Open http://localhost:5173 (API on http://localhost:4000).

## Demo roles
Open **/roles** (also linked from the login page and the "Switch role" button in the top bar) and click any role to view the app as that role. All demo users use password `demo123`:

| Role | Email |
|---|---|
| Administrator | admin@regalpark.demo |
| Sales Staff | sales@regalpark.demo |
| Real Estate Agent | agent@regalpark.demo |
| Business Broker | broker@regalpark.demo |
| Property Owner | owner@regalpark.demo |
| Client | client@regalpark.demo |

## Data
- `data/seed.json` — deterministic mock data (regenerate with `npm run seed`).
- `data/db.json` — live data, created from the seed on first start. Settings → Data → **Reset demo data** restores the seed.

## Checks
`npm run typecheck && npm test && npm run build`

Docs: `docs/PLAN.md` (spec), `todo.md`, `architecture-record-document.md`, `hand-off.md`.
