import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PERMISSIONS } from '../../shared/permissions';
import { isIndianMobile } from '../../shared/format';
import { LEAD_SOURCES, LEAD_STATUSES, PROPERTY_STATUSES, REQUEST_STATUSES } from '../../shared/types';
import type { DB, Invoice, Property } from '../../shared/types';

const ROOT = path.resolve(__dirname, '..', '..');
const SEED = path.join(ROOT, 'data', 'seed.json');
const db: DB = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const TODAY = '2026-11-22';
const DAY = 86400000;
const ms = (d: string) => Date.parse(d.slice(0, 10) + 'T00:00:00Z');
const daysFromToday = (d: string) => (ms(d) - ms(TODAY)) / DAY;

const byId = <T extends { id: string }>(arr: T[]) => new Map(arr.map(x => [x.id, x]));
const P = byId(db.properties), C = byId(db.clients), R = byId(db.requests), CON = byId(db.contracts), INV = byId(db.invoices);
const O = byId(db.owners), A = byId(db.agents), B = byId(db.brokers), U = byId(db.users), PL = byId(db.plans), ST = byId(db.staff);
const user = (email: string) => db.users.find(u => u.email === email)!;
const paid = (i: Invoice) => i.payments.reduce((s, p) => s + p.amount, 0);
const villas = db.properties.filter(p => p.project === 'Sterlitee Regal Park');
const COLLECTIONS = ['users', 'owners', 'staff', 'agents', 'brokers', 'clients', 'properties', 'leads', 'requests', 'tenants', 'contracts', 'invoices', 'plans'] as const;

describe('seed: shape and counts (§6)', () => {
  it('has every DB collection plus settings and permissions', () => {
    for (const c of COLLECTIONS) expect(Array.isArray(db[c]), c).toBe(true);
    expect(db.settings).toBeTruthy();
    expect(db.permissions).toBeTruthy();
  });
  it.each([
    ['plans', 3], ['staff', 8], ['agents', 6], ['brokers', 5], ['owners', 12], ['clients', 30], ['leads', 70], ['tenants', 9],
  ] as const)('%s count = %d', (col, n) => {
    expect(db[col]).toHaveLength(n);
  });
  it('properties ≈ 44: 28 villas + 16 other (11 rent, 5 resale)', () => {
    expect(db.properties).toHaveLength(44);
    expect(villas).toHaveLength(28);
    const others = db.properties.filter(p => p.project !== 'Sterlitee Regal Park');
    expect(others).toHaveLength(16);
    expect(others.filter(p => p.transactionType === 'Rent')).toHaveLength(11);
    expect(others.filter(p => p.transactionType === 'Sale')).toHaveLength(5);
  });
  it('approvals: 4 pending and 1 rejected (with reason)', () => {
    expect(db.properties.filter(p => p.approval === 'pending')).toHaveLength(4);
    const rej = db.properties.filter(p => p.approval === 'rejected');
    expect(rej).toHaveLength(1);
    expect(rej[0].rejectReason?.trim()).toBeTruthy();
  });
  it('requests: 16 buy + 12 rent; buy ones are on villas, rent ones on Rent listings', () => {
    const buy = db.requests.filter(r => r.kind === 'buy'), rent = db.requests.filter(r => r.kind === 'rent');
    expect(buy).toHaveLength(16);
    expect(rent).toHaveLength(12);
    for (const r of buy) expect(villas.map(v => v.id)).toContain(r.propertyId);
    for (const r of rent) expect(P.get(r.propertyId)!.transactionType).toBe('Rent');
  });
  it('requests span all RequestStatus values', () => {
    expect(new Set(db.requests.map(r => r.status))).toEqual(new Set(REQUEST_STATUSES));
  });
  it('tenants: 1 Notice Period, 1 Ended, rest Active; exactly 2 Active leases end within 90 days', () => {
    const by = (s: string) => db.tenants.filter(t => t.status === s).length;
    expect(by('Notice Period')).toBe(1);
    expect(by('Ended')).toBe(1);
    expect(by('Active')).toBe(7);
    const soon = db.tenants.filter(t => t.status === 'Active' && daysFromToday(t.leaseEnd) <= 90);
    expect(soon).toHaveLength(2);
  });
  it('exactly 2 overdue invoices; some partially paid', () => {
    expect(db.invoices.filter(i => i.status === 'Overdue')).toHaveLength(2);
    expect(db.invoices.filter(i => i.status === 'Partially Paid').length).toBeGreaterThan(0);
  });
});

describe('seed: unique ids, codes and numbers', () => {
  it.each(COLLECTIONS)('%s ids are unique and non-empty', col => {
    const ids = (db[col] as { id: string }[]).map(x => x.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('ids are unique across all collections', () => {
    const all = COLLECTIONS.flatMap(c => (db[c] as { id: string }[]).map(x => x.id));
    expect(new Set(all).size).toBe(all.length);
  });
  const codeCases: [string, string, keyof DB['settings']['prefixes'], () => string[]][] = [
    ['properties.code', 'SRP-', 'property', () => db.properties.map(x => x.code)],
    ['owners.code', 'PO-', 'owner', () => db.owners.map(x => x.code)],
    ['agents.code', 'AG-', 'agent', () => db.agents.map(x => x.code)],
    ['brokers.code', 'BB-', 'broker', () => db.brokers.map(x => x.code)],
    ['staff.code', 'ST-', 'staff', () => db.staff.map(x => x.code)],
    ['clients.code', 'CL-', 'client', () => db.clients.map(x => x.code)],
    ['buy requests.number', 'BR-', 'buy', () => db.requests.filter(r => r.kind === 'buy').map(x => x.number)],
    ['rent requests.number', 'RR-', 'rent', () => db.requests.filter(r => r.kind === 'rent').map(x => x.number)],
    ['invoices.number', 'INV-', 'invoice', () => db.invoices.map(x => x.number)],
    ['contracts.number', 'CON-', 'contract', () => db.contracts.map(x => x.number)],
    ['tenants.referenceNo', 'TN-', 'tenant', () => db.tenants.map(x => x.referenceNo)],
  ];
  it.each(codeCases)('%s: unique, prefix %s + 4 digits, nextNumbers = count+1 and > max', (_l, prefix, key, get) => {
    const codes = get();
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(new RegExp(`^${prefix}\\d{4}$`));
    expect(db.settings.prefixes[key]).toBe(prefix);
    expect(db.settings.nextNumbers[key]).toBe(codes.length + 1);
    const max = Math.max(...codes.map(c => Number(c.slice(prefix.length))));
    expect(db.settings.nextNumbers[key]).toBeGreaterThan(max);
  });
  it('request numbers are unique across both kinds', () => {
    const n = db.requests.map(r => r.number);
    expect(new Set(n).size).toBe(n.length);
  });
  it('user emails are unique (case-insensitive)', () => {
    const e = db.users.map(u => u.email.toLowerCase());
    expect(new Set(e).size).toBe(e.length);
  });
});

describe('seed: referential integrity (every foreign id exists)', () => {
  const fk = (label: string, v: string | undefined, set: Map<string, unknown>) => {
    if (v !== undefined) expect(set.has(v), `${label} -> ${v}`).toBe(true);
  };
  it('properties.ownerId/agentId/brokerId', () => {
    for (const p of db.properties) { fk(`${p.code}.ownerId`, p.ownerId, O); fk(`${p.code}.agentId`, p.agentId, A); fk(`${p.code}.brokerId`, p.brokerId, B); }
  });
  it('every property has an owner', () => {
    for (const p of db.properties) expect(p.ownerId, p.code).toBeTruthy();
  });
  it('leads.assignedTo (users) and leads.propertyId', () => {
    for (const l of db.leads) { fk(`${l.id}.assignedTo`, l.assignedTo, U); fk(`${l.id}.propertyId`, l.propertyId, P); }
  });
  it('requests.propertyId/clientId/contractId/invoiceId', () => {
    for (const r of db.requests) {
      expect(P.has(r.propertyId), `${r.number}.propertyId`).toBe(true);
      expect(C.has(r.clientId), `${r.number}.clientId`).toBe(true);
      fk(`${r.number}.contractId`, r.contractId, CON); fk(`${r.number}.invoiceId`, r.invoiceId, INV);
    }
  });
  it('tenants.clientId/propertyId/requestId', () => {
    for (const t of db.tenants) {
      expect(C.has(t.clientId), `${t.referenceNo}.clientId`).toBe(true);
      expect(P.has(t.propertyId), `${t.referenceNo}.propertyId`).toBe(true);
      expect(R.has(t.requestId), `${t.referenceNo}.requestId`).toBe(true);
    }
  });
  it('contracts.requestId/clientId/propertyId', () => {
    for (const c of db.contracts) {
      expect(R.has(c.requestId), `${c.number}.requestId`).toBe(true);
      expect(C.has(c.clientId), `${c.number}.clientId`).toBe(true);
      expect(P.has(c.propertyId), `${c.number}.propertyId`).toBe(true);
    }
  });
  it('invoices.requestId/clientId/propertyId', () => {
    for (const i of db.invoices) {
      fk(`${i.number}.requestId`, i.requestId, R);
      expect(C.has(i.clientId), `${i.number}.clientId`).toBe(true);
      expect(P.has(i.propertyId), `${i.number}.propertyId`).toBe(true);
    }
  });
  it('agents/brokers.planId', () => {
    for (const a of db.agents) fk(`${a.code}.planId`, a.planId, PL);
    for (const b of db.brokers) fk(`${b.code}.planId`, b.planId, PL);
  });
  it('users.linkedId points into the collection matching the role; admin has none required', () => {
    const sets: Record<string, Map<string, unknown>> = { staff: ST, agent: A, broker: B, owner: O, client: C };
    for (const u of db.users) {
      if (u.role === 'admin') continue;
      expect(u.linkedId, u.email).toBeTruthy();
      expect(sets[u.role].has(u.linkedId!), `${u.email}.linkedId -> ${u.linkedId}`).toBe(true);
    }
  });
  it('createdBy, when present, is a user id', () => {
    for (const c of COLLECTIONS) for (const x of db[c] as { createdBy?: string }[]) fk(`${c}.createdBy`, x.createdBy, U);
  });
  it('back-links agree: request.contractId/invoiceId ↔ contract/invoice.requestId with same kind/client/property', () => {
    for (const r of db.requests) {
      if (r.contractId) {
        const c = CON.get(r.contractId)!;
        expect(c.requestId).toBe(r.id);
        expect([c.kind, c.clientId, c.propertyId, c.amount]).toEqual([r.kind, r.clientId, r.propertyId, r.contractAmount]);
      }
      if (r.invoiceId) {
        const i = INV.get(r.invoiceId)!;
        expect(i.requestId).toBe(r.id);
        expect([i.kind, i.clientId, i.propertyId]).toEqual([r.kind, r.clientId, r.propertyId]);
      }
    }
    for (const c of db.contracts) expect(R.get(c.requestId)!.contractId).toBe(c.id);
    for (const i of db.invoices) if (i.requestId) expect(R.get(i.requestId)!.invoiceId).toBe(i.id);
  });
  it('request.propertyPrice equals the property price', () => {
    for (const r of db.requests) expect(r.propertyPrice, r.number).toBe(P.get(r.propertyId)!.price);
  });
  it('seed permissions equal DEFAULT_PERMISSIONS', () => {
    expect(db.permissions).toEqual(DEFAULT_PERMISSIONS);
  });
});

describe('seed: demo users (§6)', () => {
  it.each([
    ['admin@regalpark.demo', 'admin'], ['sales@regalpark.demo', 'staff'], ['agent@regalpark.demo', 'agent'],
    ['broker@regalpark.demo', 'broker'], ['owner@regalpark.demo', 'owner'], ['client@regalpark.demo', 'client'],
  ])('%s exists with role %s, password demo123, active', (email, role) => {
    const matches = db.users.filter(u => u.email === email);
    expect(matches).toHaveLength(1);
    expect(matches[0].role).toBe(role);
    expect(matches[0].password).toBe('demo123');
    expect(matches[0].active).toBe(true);
  });
  it('agent demo user is linked to the first agent; ≥6 properties and ≥8 leads', () => {
    const u = user('agent@regalpark.demo');
    expect(u.linkedId).toBe(db.agents[0].id);
    expect(db.properties.filter(p => p.agentId === u.linkedId).length).toBeGreaterThanOrEqual(6);
    expect(db.leads.filter(l => l.assignedTo === u.id).length).toBeGreaterThanOrEqual(8);
  });
  it('sales demo user is linked to a staff record', () => {
    expect(ST.has(user('sales@regalpark.demo').linkedId!)).toBe(true);
  });
  it('broker demo user has ≥4 properties', () => {
    const u = user('broker@regalpark.demo');
    expect(db.properties.filter(p => p.brokerId === u.linkedId).length).toBeGreaterThanOrEqual(4);
  });
  it('owner demo user is an individual (not Sterlitee) with ≥3 rental properties incl. tenants', () => {
    const u = user('owner@regalpark.demo');
    expect(O.get(u.linkedId!)!.name).not.toBe('Sterlitee Developers');
    const rentals = db.properties.filter(p => p.ownerId === u.linkedId && p.transactionType === 'Rent');
    expect(rentals.length).toBeGreaterThanOrEqual(3);
    expect(db.tenants.some(t => rentals.some(p => p.id === t.propertyId))).toBe(true);
  });
  it('client demo user has ≥1 buy request, ≥1 tenancy and invoices', () => {
    const id = user('client@regalpark.demo').linkedId;
    expect(db.requests.filter(r => r.kind === 'buy' && r.clientId === id).length).toBeGreaterThanOrEqual(1);
    expect(db.tenants.filter(t => t.clientId === id).length).toBeGreaterThanOrEqual(1);
    expect(db.invoices.filter(i => i.clientId === id).length).toBeGreaterThanOrEqual(1);
  });
});

describe('seed: settings, plans, people', () => {
  it('settings branding per §2', () => {
    const s = db.settings;
    expect(s.companyName).toBe('Sterlitee Developers');
    expect(s.productName).toBe('Regal Park CRM');
    expect(s.projectName).toBe('Sterlitee Regal Park');
    expect(s.tagline).toBe('Your Private World, Nestled in Electronic City');
    expect(s.rera).toBe('PRM/KA/RERA/1251/308/PR/180925/008098');
    expect(s.phone).toBe('+91 90080 32626');
    expect(s.currency).toBe('INR');
  });
  it('plans Silver/Gold/Platinum per §6', () => {
    const got = db.plans.map(p => [p.name, p.monthlyListings, p.rate, p.paymentType]);
    expect(got).toEqual([['Silver', 10, 4999, 'Monthly'], ['Gold', 30, 11999, 'Monthly'], ['Platinum', 999, 119999, 'Yearly']]);
  });
  it('staff designations per §6', () => {
    expect(db.staff.map(s => s.designation).sort()).toEqual(
      ['Sales Head', 'Sales Manager', 'Sales Manager', 'CRM Executive', 'CRM Executive', 'Site Engineer', 'Accounts', 'Legal'].sort());
  });
  it('agents carry RERA agent numbers PRM/KA/RERA/1251/310/AG/...', () => {
    for (const a of db.agents) expect(a.reraAgentNo).toMatch(/^PRM\/KA\/RERA\/1251\/310\/AG\/.+/);
  });
  it('Sterlitee Developers is an owner', () => {
    expect(db.owners.filter(o => o.name === 'Sterlitee Developers')).toHaveLength(1);
  });
  it('clients include Buyers, Tenants and Investors', () => {
    expect(new Set(db.clients.map(c => c.type))).toEqual(new Set(['Buyer', 'Tenant', 'Investor']));
  });
  it('every person record phone is a valid Indian mobile', () => {
    for (const x of [...db.staff, ...db.agents, ...db.brokers, ...db.owners, ...db.clients]) expect(isIndianMobile(x.phone), `${x.code} ${x.phone}`).toBe(true);
    for (const u of db.users) if (u.phone) expect(isIndianMobile(u.phone), u.email).toBe(true);
  });
});

describe('seed: villas (§6)', () => {
  const CFG: Record<string, { beds: number; plot: number; built: number; price: [number, number] }> = {
    Riora: { beds: 4, plot: 1500, built: 3200, price: [43000000, 45500000] },
    Avira: { beds: 4, plot: 1750, built: 3650, price: [49000000, 52000000] },
    Selora: { beds: 4, plot: 1925, built: 3950, price: [54000000, 58000000] },
    Elora: { beds: 5, plot: 2000, built: 4400, price: [61000000, 66000000] },
  };
  const cfgOf = (v: Property) => v.name.split(' ')[0];
  it('7 villas per config, named "<Cfg> Villa X-NN", unique names', () => {
    for (const k of Object.keys(CFG)) expect(villas.filter(v => cfgOf(v) === k)).toHaveLength(7);
    for (const v of villas) expect(v.name).toMatch(/^(Riora|Avira|Selora|Elora) Villa [RASE]-\d{2}$/);
    expect(new Set(villas.map(v => v.name)).size).toBe(28);
  });
  it('villa prices within config range (both bounds inclusive)', () => {
    for (const v of villas) {
      const [lo, hi] = CFG[cfgOf(v)].price;
      expect(v.price, v.name).toBeGreaterThanOrEqual(lo);
      expect(v.price, v.name).toBeLessThanOrEqual(hi);
    }
  });
  it('villa beds, plot, built area (~ ±5%) match config', () => {
    for (const v of villas) {
      const c = CFG[cfgOf(v)];
      expect(v.beds).toBe(c.beds);
      expect(v.plotSqft).toBe(c.plot);
      expect(Math.abs(v.areaSqft - c.built) / c.built).toBeLessThanOrEqual(0.05);
    }
  });
  it('villa location, owner, condition, possession, statuses, amenities', () => {
    const site = ['Clubhouse', 'Tennis Court', 'Basketball Court', 'Skating Rink', 'Yoga Deck', 'Kids Play Area', 'Jungle Gym', 'Aroma Garden', 'Multipurpose Lawn', '10 Landscaped Parks', 'EV Charging', '24x7 Security'];
    const sterlitee = db.owners.find(o => o.name === 'Sterlitee Developers')!.id;
    for (const v of villas) {
      expect(v.city).toBe('Bengaluru');
      expect(v.zip).toBe('560100');
      expect(v.style).toBe('Villa');
      expect(v.transactionType).toBe('Sale');
      expect(v.ownerId).toBe(sterlitee);
      expect(Math.abs(v.lat! - 12.8196)).toBeLessThan(0.01);
      expect(Math.abs(v.lng! - 77.6588)).toBeLessThan(0.01);
      expect(['Under Construction', 'Pre Construction']).toContain(v.condition);
      expect(v.possessionDate?.slice(0, 7)).toBe('2028-12');
      expect(['Active', 'Pending Sale', 'Sold', 'Closed Sale', 'Backup']).toContain(v.status);
      for (const a of v.amenities) expect(site).toContain(a);
    }
    expect(new Set(villas.map(v => v.status))).toEqual(new Set(['Active', 'Pending Sale', 'Sold', 'Closed Sale', 'Backup']));
  });
  it('Sterlitee owns all and only the Regal Park villas', () => {
    const sterlitee = db.owners.find(o => o.name === 'Sterlitee Developers')!.id;
    expect(db.properties.filter(p => p.ownerId === sterlitee).map(p => p.id).sort()).toEqual(villas.map(v => v.id).sort());
  });
});

describe('seed: other listings and property details', () => {
  const others = db.properties.filter(p => p.project !== 'Sterlitee Regal Park');
  it('rent listings priced ₹28k–₹2.5L per month', () => {
    for (const p of others.filter(x => x.transactionType === 'Rent')) {
      expect(p.price).toBeGreaterThanOrEqual(28000);
      expect(p.price).toBeLessThanOrEqual(250000);
      expect(p.rentalType).toBe('Month(s)');
    }
  });
  it('other listings are in the §6 Bengaluru localities', () => {
    const locs = ['Electronic City', 'HSR Layout', 'Sarjapur Road', 'Whitefield', 'Koramangala', 'Bannerghatta Road', 'Hebbal'];
    for (const p of others) {
      expect(p.city).toBe('Bengaluru');
      expect(locs.some(l => p.address.includes(l) || p.name.includes(l)), p.name).toBe(true);
    }
  });
  it('each property has 1–3 expenses (Property tax / BBMP khata / Maintenance) and 2–4 rooms', () => {
    for (const p of db.properties) {
      expect(p.expenses.length, p.code).toBeGreaterThanOrEqual(1);
      expect(p.expenses.length, p.code).toBeLessThanOrEqual(3);
      for (const e of p.expenses) expect(/^(Property tax|BBMP khata|Maintenance)/.test(e.label), e.label).toBe(true);
      expect(p.rooms.length, p.code).toBeGreaterThanOrEqual(2);
      expect(p.rooms.length, p.code).toBeLessThanOrEqual(4);
    }
  });
  it('all property statuses are valid PropertyStatus values', () => {
    for (const p of db.properties) expect(PROPERTY_STATUSES).toContain(p.status);
  });
});

describe('seed: leads (§6)', () => {
  it('70 leads created within the last 120 days, none in the future', () => {
    for (const l of db.leads) {
      const d = daysFromToday(l.createdAt);
      expect(d, l.id).toBeLessThanOrEqual(0);
      expect(d, l.id).toBeGreaterThanOrEqual(-120);
    }
  });
  it('every lead phone is a valid Indian mobile', () => {
    for (const l of db.leads) expect(isIndianMobile(l.phone), `${l.id} ${l.phone}`).toBe(true);
  });
  it('sources and statuses are valid; funnel coverage', () => {
    for (const l of db.leads) { expect(LEAD_SOURCES).toContain(l.source); expect(LEAD_STATUSES).toContain(l.status); }
    expect(new Set(db.leads.map(l => l.status)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(db.leads.map(l => l.source)).size).toBeGreaterThanOrEqual(5);
  });
  it('interest is a villa config or a rental', () => {
    for (const l of db.leads) expect(l.interest, l.id).toMatch(/^(Riora|Avira|Selora|Elora)|^Rental/);
  });
  it('budgets (when set) are within ₹40L–₹7Cr', () => {
    for (const l of db.leads) if (l.budget !== undefined) {
      expect(l.budget).toBeGreaterThanOrEqual(4000000);
      expect(l.budget).toBeLessThanOrEqual(70000000);
    }
  });
  it('visit statuses have a site visit date; scheduled visits are today or later', () => {
    for (const l of db.leads) {
      if (['Site Visit Scheduled', 'Site Visit Done'].includes(l.status)) expect(l.siteVisitDate, l.id).toBeTruthy();
      if (l.status === 'Site Visit Scheduled') expect(daysFromToday(l.siteVisitDate!)).toBeGreaterThanOrEqual(0);
      if (l.status === 'Site Visit Done') expect(daysFromToday(l.siteVisitDate!)).toBeLessThanOrEqual(0);
    }
  });
  it('leads are assigned to staff/agent (or broker) users that exist', () => {
    for (const l of db.leads) {
      expect(l.assignedTo, l.id).toBeTruthy();
      expect(['staff', 'agent', 'broker']).toContain(U.get(l.assignedTo!)!.role);
    }
  });
});

describe('seed: requests, invoices, tenants workflow consistency', () => {
  it('invoice status is consistent with payments', () => {
    for (const i of db.invoices) {
      const s = paid(i);
      expect(s, i.number).toBeLessThanOrEqual(i.amount);
      for (const p of i.payments) expect(p.amount, i.number).toBeGreaterThan(0);
      if (i.status === 'Paid') expect(s, i.number).toBe(i.amount);
      if (i.status === 'Partially Paid') { expect(s).toBeGreaterThan(0); expect(s).toBeLessThan(i.amount); }
      if (i.status === 'Unpaid') expect(s, i.number).toBe(0);
      if (s === i.amount) expect(i.status, i.number).toBe('Paid');
    }
  });
  it('Overdue only when there is an unpaid balance and dueDate < today', () => {
    for (const i of db.invoices.filter(x => x.status === 'Overdue')) {
      expect(paid(i), i.number).toBeLessThan(i.amount);
      expect(ms(i.dueDate), i.number).toBeLessThan(ms(TODAY));
    }
  });
  it('an Unpaid invoice is not already past due (would be Overdue)', () => {
    for (const i of db.invoices.filter(x => x.status === 'Unpaid')) expect(ms(i.dueDate), i.number).toBeGreaterThanOrEqual(ms(TODAY));
  });
  it('payment dates are not in the future and modes are valid', () => {
    for (const i of db.invoices) for (const p of i.payments) {
      expect(ms(p.date), i.number).toBeLessThanOrEqual(ms(TODAY));
      expect(['UPI', 'NEFT', 'RTGS', 'Cheque', 'Cash']).toContain(p.mode);
    }
  });
  it('invoice amount follows §5: buy = reservationAmount (or 10%), rent = contractAmount/termMonths', () => {
    for (const i of db.invoices) {
      const r = R.get(i.requestId!)!;
      const p = P.get(i.propertyId)!;
      if (i.kind === 'buy') expect(i.amount, i.number).toBe(p.reservationAmount ?? Math.round(r.contractAmount * 0.1));
      else expect(i.amount, i.number).toBe(Math.round(r.contractAmount / r.termMonths));
    }
  });
  it('Approved/Complete requests have both a contract and an invoice', () => {
    for (const r of db.requests.filter(x => x.status === 'Approved' || x.status === 'Complete')) {
      expect(r.contractId, r.number).toBeTruthy();
      expect(r.invoiceId, r.number).toBeTruthy();
    }
  });
  it('Draft/Submitted/Sent/Cancelled/Expired requests have no tenant', () => {
    const tenReq = new Set(db.tenants.map(t => t.requestId));
    for (const r of db.requests.filter(x => !['Approved', 'Complete'].includes(x.status))) expect(tenReq.has(r.id), r.number).toBe(false);
  });
  it('signed contracts have signedAt; unsigned do not', () => {
    for (const c of db.contracts) expect(!!c.signedAt, c.number).toBe(c.signed);
  });
  it("every tenant's request is an approved (or completed) rent request on the same client/property", () => {
    for (const t of db.tenants) {
      const r = R.get(t.requestId)!;
      expect(r.kind, t.referenceNo).toBe('rent');
      expect(['Approved', 'Complete'], t.referenceNo).toContain(r.status);
      expect(r.clientId).toBe(t.clientId);
      expect(r.propertyId).toBe(t.propertyId);
    }
  });
  it('every Approved rent request has exactly one tenant (created once)', () => {
    for (const r of db.requests.filter(x => x.kind === 'rent' && x.status === 'Approved')) {
      expect(db.tenants.filter(t => t.requestId === r.id), r.number).toHaveLength(1);
    }
    const reqIds = db.tenants.map(t => t.requestId);
    expect(new Set(reqIds).size).toBe(reqIds.length);
  });
  it('at most one non-ended tenancy per property', () => {
    const live = db.tenants.filter(t => t.status !== 'Ended').map(t => t.propertyId);
    expect(new Set(live).size).toBe(live.length);
  });
  it('tenant lease dates are consistent with status and today', () => {
    for (const t of db.tenants) {
      expect(ms(t.leaseStart), t.referenceNo).toBeLessThan(ms(t.leaseEnd));
      if (t.status === 'Ended') expect(ms(t.leaseEnd), t.referenceNo).toBeLessThan(ms(TODAY));
      else {
        expect(ms(t.leaseStart), t.referenceNo).toBeLessThanOrEqual(ms(TODAY));
        expect(ms(t.leaseEnd), t.referenceNo).toBeGreaterThanOrEqual(ms(TODAY));
      }
      expect(t.monthlyRent).toBe(P.get(t.propertyId)!.price);
      expect(t.deposit).toBeGreaterThan(0);
    }
  });
  it('properties with Active / Notice Period tenants are Rented', () => {
    for (const t of db.tenants.filter(x => x.status !== 'Ended')) expect(P.get(t.propertyId)!.status, t.referenceNo).toBe('Rented');
  });
  it('every Rented property has a tenant record', () => {
    const tenanted = new Set(db.tenants.map(t => t.propertyId));
    for (const p of db.properties.filter(x => x.status === 'Rented')) expect(tenanted.has(p.id), p.code).toBe(true);
  });
  it('Complete buy requests -> property Sold; Sold villas have a Complete buy request', () => {
    const buy = db.requests.filter(r => r.kind === 'buy');
    for (const r of buy.filter(x => x.status === 'Complete')) expect(P.get(r.propertyId)!.status, r.number).toBe('Sold');
    for (const p of db.properties.filter(x => x.status === 'Sold')) {
      expect(buy.some(r => r.propertyId === p.id && r.status === 'Complete'), p.code).toBe(true);
    }
  });
  it('Sale properties are never Rented and Rent properties are never Sold', () => {
    for (const p of db.properties) {
      if (p.transactionType === 'Sale') expect(p.status, p.code).not.toBe('Rented');
      else expect(['Sold', 'Closed Sale', 'Pending Sale'], p.code).not.toContain(p.status);
    }
  });
  it('pending-approval properties are not offered (not Active/Rented/Sold)', () => {
    for (const p of db.properties.filter(x => x.approval !== 'approved')) expect(['Active', 'Rented', 'Sold'], p.code).not.toContain(p.status);
  });
});

describe('seed: determinism', () => {
  const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
  const runSeed = (cwd: string) => {
    const tsxCli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    execFileSync(process.execPath, [tsxCli, path.join(ROOT, 'scripts', 'seed.ts')], { cwd, stdio: 'pipe' });
    return fs.readFileSync(path.join(cwd, 'data', 'seed.json'));
  };
  it('two fresh runs of scripts/seed.ts produce byte-identical output equal to committed data/seed.json', () => {
    const before = sha(fs.readFileSync(SEED));
    const t1 = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-a-'));
    const t2 = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-b-'));
    try {
      const a = runSeed(t1);
      const b = runSeed(t2);
      expect(sha(a)).toBe(sha(b));
      expect(sha(a.toString('utf8').replace(/\r\n/g, '\n'))).toBe(sha(fs.readFileSync(SEED, 'utf8').replace(/\r\n/g, '\n')));
    } finally {
      fs.rmSync(t1, { recursive: true, force: true });
      fs.rmSync(t2, { recursive: true, force: true });
    }
    expect(sha(fs.readFileSync(SEED))).toBe(before);
  }, 120000);
});
