import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { can, DEFAULT_PERMISSIONS } from '../shared/permissions';
import { isIndianMobile } from '../shared/format';
import { MODULES, moduleFor, REQUEST_STATUSES, ROLES } from '../shared/types';
import type { Action, Contract, Invoice, Module, PermissionMatrix, Property, PropertyRequest, RequestStatus, User } from '../shared/types';
import { HttpError, login, logout, me, publicUser, requireAuth } from './auth';
import { addPayment, CODE_FIELD, createContract, createInvoice, dashboard, newId, nextCode, report, REPORT_TYPES, setRequestStatus, today } from './domain';
import { ownerFieldFor, scopedList } from './scope';
import { getDb, reset, save } from './store';

type Rec = Record<string, any>;
const COLLECTIONS = ['owners', 'staff', 'agents', 'brokers', 'clients', 'properties', 'leads', 'requests', 'tenants', 'contracts', 'invoices', 'plans', 'users'];
const NEWEST_FIRST = ['leads', 'requests', 'invoices', 'contracts', 'tenants', 'clients'];
const PEOPLE = ['owners', 'staff', 'agents', 'brokers', 'clients', 'users', 'plans'];
const OPTIONAL_NUMBERS = ['rentalPrice', 'maintenanceFee', 'reservationAmount', 'plotSqft', 'floors', 'yearBuilt', 'lat', 'lng', 'budget'];
const CLOSED = ['Cancelled', 'Complete', 'Expired'];
const PROTECTED = ['id', 'createdAt', 'createdBy'];

const strip = (col: string, r: Rec) => (col === 'users' ? publicUser(r as User) : r);
const missing = (v: unknown) => v === undefined || v === null || String(v).trim() === '';
const bad = (field: string, msg = `${field} is required`) => new HttpError(400, msg, field);

function allow(res: Response, module: Module | undefined, action: Action) {
  if (!module || !can(getDb().permissions, me(res).role, module, action)) throw new HttpError(403, 'Forbidden');
}

/** Required-field checks per PLAN §5. */
function validate(col: string, b: Rec, creating: boolean) {
  const need = (...fields: string[]) => fields.forEach(f => { if ((creating || f in b) && missing(b[f])) throw bad(f); });
  if (PEOPLE.includes(col)) need('name');
  if (col === 'properties') {
    need('name', 'transactionType');
    if ((creating || 'price' in b) && !(Number(b.price) >= 0 && !missing(b.price))) throw bad('price', 'price must be a number >= 0');
  }
  if (col === 'leads') {
    need('name', 'phone');
    if ('phone' in b && !isIndianMobile(b.phone)) throw bad('phone', 'phone must be a 10-digit Indian mobile number');
  }
  if (col === 'requests') need('propertyId', 'clientId', 'kind');
  if (col === 'invoices') {
    need('clientId', 'propertyId');
    if ('amount' in b && !(Number(b.amount) >= 0)) throw bad('amount', 'amount must be a number >= 0');
  }
}

/** Scoped lookup: 404 if absent, 403 if it exists but is outside the user's scope. */
function locate(res: Response, col: string, id: string): Rec {
  const db = getDb();
  const rec = ((db as unknown as Rec)[col] as Rec[]).find(r => r.id === id);
  if (!rec) throw new HttpError(404, 'Not found');
  if (!scopedList(db, me(res), col).includes(rec)) throw new HttpError(403, 'Forbidden');
  return rec;
}

const requestModule = (r: PropertyRequest) => moduleFor('requests', r.kind);

function build(col: string, b: Rec, user: User): Rec {
  const db = getDb();
  const rec: Rec = { ...b, id: newId(), createdAt: new Date().toISOString(), createdBy: user.id };
  const code = CODE_FIELD[col];
  if (code) rec[code[1]] = nextCode(db.settings, code[0]);
  const ownField = ownerFieldFor(user.role);
  if (col === 'users') { rec.password = b.password || 'demo123'; rec.active = b.active ?? true; }
  if (col === 'properties') {
    const pending = user.role !== 'admin' && db.settings.requirePropertyApproval;
    Object.assign(rec, { amenities: [], expenses: [], rooms: [], listingPrivacy: 'public', beds: 0, baths: 0, areaSqft: 0, city: '', state: '', zip: '', address: '', ...b },
      { id: rec.id, approval: pending ? 'pending' : (b.approval ?? 'approved') });
    rec.status = b.status ?? (pending ? 'Pending' : 'New');
    rec.price = Number(b.price);
    if (ownField) rec[ownField] = user.linkedId; // own field is always the creator, whatever the body says
  }
  if (col === 'leads') {
    rec.status = b.status ?? 'New';
    if (ownField) rec.assignedTo = user.id; // keeps it in the creator's scope
  }
  if (col === 'invoices') { rec.payments = []; rec.status = 'Unpaid'; rec.kind = b.kind ?? 'rent'; rec.amount = Number(b.amount ?? 0); }
  if (col === 'requests') {
    const prop = db.properties.find(p => p.id === b.propertyId);
    if (!prop || !scopedList(db, user, 'properties').includes(prop)) throw bad('propertyId', 'Property not found');
    if (!['buy', 'rent'].includes(b.kind)) throw bad('kind', 'kind must be buy or rent');
    if (user.role === 'client') rec.clientId = user.linkedId;
    if (!db.clients.some(c => c.id === rec.clientId)) throw bad('clientId', 'Client not found');
    const term = Number(b.termMonths) || (b.kind === 'rent' ? 11 : 0);
    Object.assign(rec, {
      number: nextCode(db.settings, b.kind), termMonths: term, propertyPrice: prop.price,
      contractAmount: b.contractAmount ?? (b.kind === 'rent' ? (prop.rentalPrice ?? prop.price) * term : prop.price),
      startDate: b.startDate || today(), status: b.status ?? 'Submitted', inspect: !!b.inspect,
    });
    delete rec.contractId; delete rec.invoiceId;
  }
  return rec;
}

/** The UI sends '' for empty optional number inputs; store them as absent. */
const clearEmptyNumbers = (b: Rec) => OPTIONAL_NUMBERS.forEach(k => { if (b[k] === '') b[k] = undefined; });

export function createApp() {
  const app = express();
  app.use(express.json());
  const api = express.Router();
  app.use('/api', api);

  api.post('/auth/login', (req, res) => res.json(login(req.body?.email, req.body?.password)));
  api.use(requireAuth);
  api.get('/auth/me', (_req, res) => res.json({ user: publicUser(me(res)) }));
  api.post('/auth/logout', (req, res) => { logout(req); res.json({ ok: true }); });

  api.get('/dashboard', (req, res) => {
    const db = getDb(), u = me(res);
    const list = (c: string) => scopedList(db, u, c);
    const seeLeads = can(db.permissions, u.role, 'leads', 'view');
    const d = dashboard(list('properties') as Property[], list('requests'), list('invoices') as Invoice[], seeLeads ? list('leads') : [], String(req.query.period ?? 'all'));
    res.json(seeLeads ? d : { ...d, leadsByStatus: [], leadsBySource: [], recentLeads: [] });
  });

  api.get('/reports/:type', (req, res) => {
    allow(res, 'reports', 'view');
    if (!REPORT_TYPES.includes(req.params.type)) throw new HttpError(404, 'Unknown report');
    res.json(report(getDb(), req.params.type));
  });

  api.get('/settings', (_req, res) => res.json(getDb().settings));
  api.put('/settings', (req, res) => {
    allow(res, 'settings', 'edit');
    const db = getDb();
    const { prefixes, nextNumbers, ...rest } = req.body ?? {};
    Object.assign(db.settings, rest);
    if (prefixes) db.settings.prefixes = { ...db.settings.prefixes, ...prefixes };
    if (nextNumbers) db.settings.nextNumbers = { ...db.settings.nextNumbers, ...nextNumbers };
    save();
    res.json(db.settings);
  });

  api.get('/permissions', (_req, res) => res.json(getDb().permissions));
  api.put('/permissions', (req, res) => {
    allow(res, 'settings', 'edit');
    const m = req.body as PermissionMatrix;
    if (!m || typeof m !== 'object' || ROLES.some(r => typeof m[r] !== 'object')) throw bad('permissions', 'Invalid permission matrix');
    for (const r of ROLES) for (const k of Object.keys(m[r])) if (!MODULES.includes(k as Module)) throw bad('permissions', `Unknown module ${k}`);
    m.admin.settings = [...DEFAULT_PERMISSIONS.admin.settings!]; // admin can never lose settings rights
    getDb().permissions = m;
    save();
    res.json(m);
  });

  api.post('/admin/reset', (_req, res) => {
    if (me(res).role !== 'admin') throw new HttpError(403, 'Forbidden');
    reset();
    res.json({ ok: true });
  });

  // ---- workflows ----
  api.post('/properties/:id/approve', (req, res) => {
    allow(res, 'approvals', 'edit');
    const p = locate(res, 'properties', req.params.id) as Property;
    p.approval = 'approved';
    delete p.rejectReason;
    if (p.status === 'Pending') p.status = 'Active';
    save();
    res.json(p);
  });
  api.post('/properties/:id/reject', (req, res) => {
    allow(res, 'approvals', 'edit');
    const p = locate(res, 'properties', req.params.id) as Property;
    if (missing(req.body?.reason)) throw bad('reason');
    p.approval = 'rejected';
    p.rejectReason = String(req.body.reason);
    save();
    res.json(p);
  });

  const requestFor = (res: Response, id: string, module: Module | 'contracts' | 'invoices', action: Action) => {
    const r = locate(res, 'requests', id) as PropertyRequest;
    allow(res, requestModule(r), 'view');
    allow(res, module === 'contracts' || module === 'invoices' ? module : requestModule(r), action);
    return r;
  };
  api.post('/requests/:id/status', (req, res) => {
    const r = requestFor(res, req.params.id, 'buyRequests', 'edit');
    const status = req.body?.status as RequestStatus;
    if (!REQUEST_STATUSES.includes(status)) throw bad('status', 'Invalid status');
    if (status !== r.status && CLOSED.includes(r.status) && !CLOSED.includes(status)) throw bad('status', 'Request is closed');
    setRequestStatus(getDb(), r, status);
    save();
    res.json(r);
  });
  api.post('/requests/:id/contract', (req, res) => {
    const r = requestFor(res, req.params.id, 'contracts', 'create');
    const c = createContract(getDb(), r, me(res).id);
    save();
    res.json(c);
  });
  api.post('/requests/:id/invoice', (req, res) => {
    const r = requestFor(res, req.params.id, 'invoices', 'create');
    const inv = createInvoice(getDb(), r, me(res).id);
    save();
    res.status(201).json(inv);
  });
  api.post('/contracts/:id/sign', (req, res) => {
    allow(res, 'contracts', 'edit');
    const c = locate(res, 'contracts', req.params.id) as Contract;
    c.signed = true;
    c.signedAt = c.signedAt ?? new Date().toISOString();
    save();
    res.json(c);
  });
  api.post('/invoices/:id/payments', (req, res) => {
    allow(res, 'invoices', 'edit');
    const inv = addPayment(locate(res, 'invoices', req.params.id) as Invoice, req.body ?? {});
    save();
    res.json(inv);
  });

  // ---- generic CRUD ----
  api.param('col', (req, _res, next, col) => (COLLECTIONS.includes(col) ? next() : next(new HttpError(404, 'Unknown collection'))));

  api.get('/:col', (req, res) => {
    const { col } = req.params, db = getDb(), u = me(res);
    const kind = req.query.kind as 'buy' | 'rent' | undefined;
    if (col !== 'plans') allow(res, moduleFor(col, kind), 'view'); // plans list is open to any signed-in user (plan pickers)
    let rows = scopedList(db, u, col);
    if (col === 'requests' && kind) rows = rows.filter(r => r.kind === kind);
    if (NEWEST_FIRST.includes(col)) rows = [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json(rows.map(r => strip(col, r)));
  });

  api.get('/:col/:id', (req, res) => {
    const { col } = req.params;
    const rec = locate(res, col, req.params.id);
    if (col !== 'plans') allow(res, moduleFor(col, rec.kind), 'view');
    res.json(strip(col, rec));
  });

  api.post('/:col', (req, res) => {
    const { col } = req.params, b: Rec = req.body ?? {};
    allow(res, moduleFor(col, b.kind), 'create');
    if (col === 'requests' && me(res).role === 'client') b.clientId = me(res).linkedId; // clients always request for themselves
    clearEmptyNumbers(b);
    validate(col, b, true);
    const rec = build(col, b, me(res));
    ((getDb() as unknown as Rec)[col] as Rec[]).push(rec);
    save();
    res.status(201).json(strip(col, rec));
  });

  api.put('/:col/:id', (req, res) => {
    const { col } = req.params, b: Rec = { ...(req.body ?? {}) };
    const rec = locate(res, col, req.params.id);
    allow(res, moduleFor(col, rec.kind), 'edit');
    clearEmptyNumbers(b);
    validate(col, b, false);
    PROTECTED.forEach(k => delete b[k]);
    if (col === 'properties' && !can(getDb().permissions, me(res).role, 'approvals', 'edit')) { delete b.approval; delete b.rejectReason; }
    const ownField = ownerFieldFor(me(res).role);
    if (ownField && col === 'properties') b[ownField] = me(res).linkedId;
    if (ownField && col === 'leads') delete b.assignedTo;
    if (col === 'users' && missing(b.password)) delete b.password;
    Object.assign(rec, b);
    save();
    res.json(strip(col, rec));
  });

  api.delete('/:col/:id', (req, res) => {
    const { col } = req.params;
    const rec = locate(res, col, req.params.id);
    allow(res, moduleFor(col, rec.kind), 'delete');
    const list = (getDb() as unknown as Rec)[col] as Rec[];
    list.splice(list.indexOf(rec), 1);
    save();
    res.json({ ok: true });
  });

  api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json(err.field ? { error: err.message, field: err.field } : { error: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
