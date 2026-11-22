import { can, DEFAULT_PERMISSIONS } from '../shared/permissions';
import { isIndianMobile } from '../shared/format';
import { MODULES, moduleFor, REQUEST_STATUSES, ROLES } from '../shared/types';
import type { Action, Contract, DB, Invoice, Module, PermissionMatrix, Property, PropertyRequest, RequestStatus, User } from '../shared/types';
import { HttpError, login, publicUser } from './auth';
import { addPayment, CODE_FIELD, createContract, createInvoice, dashboard, newId, nextCode, report, REPORT_TYPES, setRequestStatus, today } from './domain';
import { ownerFieldFor, scopedList } from './scope';

export interface Sessions { get(token: string): string | undefined; set(token: string, userId: string): void; delete(token: string): void }
export interface Store { db(): DB; save(): void; reset(): DB; sessions: Sessions }
export interface CoreRequest { method: string; path: string; query: Record<string, string | string[] | undefined>; body: any; token?: string }
export interface CoreResponse { status: number; body: any }

type Rec = Record<string, any>;
interface Ctx { store: Store; req: CoreRequest; params: Record<string, string>; user: User }
type Handler = (c: Ctx) => CoreResponse;

const COLLECTIONS = ['owners', 'staff', 'agents', 'brokers', 'clients', 'properties', 'leads', 'requests', 'tenants', 'contracts', 'invoices', 'plans', 'users'];
const NEWEST_FIRST = ['leads', 'requests', 'invoices', 'contracts', 'tenants', 'clients'];
const PEOPLE = ['owners', 'staff', 'agents', 'brokers', 'clients', 'users', 'plans'];
const OPTIONAL_NUMBERS = ['rentalPrice', 'maintenanceFee', 'reservationAmount', 'plotSqft', 'floors', 'yearBuilt', 'lat', 'lng', 'budget'];
const CLOSED = ['Cancelled', 'Complete', 'Expired'];
const PROTECTED = ['id', 'createdAt', 'createdBy'];

const ok = (body: any, status = 200): CoreResponse => ({ status, body });
const strip = (col: string, r: Rec) => (col === 'users' ? publicUser(r as User) : r);
const missing = (v: unknown) => v === undefined || v === null || String(v).trim() === '';
const bad = (field: string, msg = `${field} is required`) => new HttpError(400, msg, field);

function allow(c: Ctx, module: Module | undefined, action: Action) {
  if (!module || !can(c.store.db().permissions, c.user.role, module, action)) throw new HttpError(403, 'Forbidden');
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
function locate(c: Ctx, col: string, id: string): Rec {
  const db = c.store.db();
  const rec = ((db as unknown as Rec)[col] as Rec[]).find(r => r.id === id);
  if (!rec) throw new HttpError(404, 'Not found');
  if (!scopedList(db, c.user, col).includes(rec)) throw new HttpError(403, 'Forbidden');
  return rec;
}

const requestModule = (r: PropertyRequest) => moduleFor('requests', r.kind);

function build(db: DB, col: string, b: Rec, user: User): Rec {
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
    if (!db.clients.some(cl => cl.id === rec.clientId)) throw bad('clientId', 'Client not found');
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

const requestFor = (c: Ctx, module: Module | 'contracts' | 'invoices', action: Action) => {
  const r = locate(c, 'requests', c.params.id) as PropertyRequest;
  allow(c, requestModule(r), 'view');
  allow(c, module === 'contracts' || module === 'invoices' ? module : requestModule(r), action);
  return r;
};

const UNSAFE = ['__proto__', 'constructor', 'prototype'];
/** The body as a fresh plain object (unsafe keys dropped); anything but an object is a 400. A missing body counts as {}. */
function objBody(c: Ctx): Rec {
  const b = c.req.body;
  if (b === undefined) return {};
  if (typeof b !== 'object' || b === null || Array.isArray(b)) throw bad('body', 'Request body must be a JSON object');
  return Object.fromEntries(Object.entries(b).filter(([k]) => !UNSAFE.includes(k)));
}

function checkCol(c: Ctx) {
  if (!COLLECTIONS.includes(c.params.col)) throw new HttpError(404, 'Unknown collection');
}

const routes: [string, string, Handler][] = [
  ['GET', '/auth/me', c => ok({ user: publicUser(c.user) })],
  ['POST', '/auth/logout', c => { c.store.sessions.delete(c.req.token ?? ''); return ok({ ok: true }); }],

  ['GET', '/dashboard', c => {
    const db = c.store.db(), u = c.user;
    const list = (col: string) => scopedList(db, u, col);
    const seeLeads = can(db.permissions, u.role, 'leads', 'view');
    const d = dashboard(list('properties') as Property[], list('requests'), list('invoices') as Invoice[], seeLeads ? list('leads') : [], String(c.req.query.period ?? 'all'));
    return ok(seeLeads ? d : { ...d, leadsByStatus: [], leadsBySource: [], recentLeads: [] });
  }],

  ['GET', '/reports/:type', c => {
    allow(c, 'reports', 'view');
    if (!REPORT_TYPES.includes(c.params.type)) throw new HttpError(404, 'Unknown report');
    return ok(report(c.store.db(), c.params.type));
  }],

  ['GET', '/settings', c => ok(c.store.db().settings)],
  ['PUT', '/settings', c => {
    allow(c, 'settings', 'edit');
    const db = c.store.db();
    const { prefixes, nextNumbers, ...rest } = objBody(c);
    Object.assign(db.settings, rest);
    if (prefixes) db.settings.prefixes = { ...db.settings.prefixes, ...prefixes };
    if (nextNumbers) db.settings.nextNumbers = { ...db.settings.nextNumbers, ...nextNumbers };
    c.store.save();
    return ok(db.settings);
  }],

  ['GET', '/permissions', c => ok(c.store.db().permissions)],
  ['PUT', '/permissions', c => {
    allow(c, 'settings', 'edit');
    const m = objBody(c) as PermissionMatrix;
    if (!m || typeof m !== 'object' || ROLES.some(r => typeof m[r] !== 'object')) throw bad('permissions', 'Invalid permission matrix');
    for (const r of ROLES) for (const k of Object.keys(m[r])) if (!MODULES.includes(k as Module)) throw bad('permissions', `Unknown module ${k}`);
    m.admin.settings = [...DEFAULT_PERMISSIONS.admin.settings!]; // admin can never lose settings rights
    c.store.db().permissions = m;
    c.store.save();
    return ok(m);
  }],

  ['POST', '/admin/reset', c => {
    if (c.user.role !== 'admin') throw new HttpError(403, 'Forbidden');
    c.store.reset();
    return ok({ ok: true });
  }],

  // ---- workflows ----
  ['POST', '/properties/:id/approve', c => {
    allow(c, 'approvals', 'edit');
    const p = locate(c, 'properties', c.params.id) as Property;
    p.approval = 'approved';
    delete p.rejectReason;
    if (p.status === 'Pending') p.status = 'Active';
    c.store.save();
    return ok(p);
  }],
  ['POST', '/properties/:id/reject', c => {
    allow(c, 'approvals', 'edit');
    const p = locate(c, 'properties', c.params.id) as Property;
    const body = objBody(c);
    if (missing(body.reason)) throw bad('reason');
    p.approval = 'rejected';
    p.rejectReason = String(body.reason);
    c.store.save();
    return ok(p);
  }],
  ['POST', '/requests/:id/status', c => {
    const r = requestFor(c, 'buyRequests', 'edit');
    const status = objBody(c).status as RequestStatus;
    if (!REQUEST_STATUSES.includes(status)) throw bad('status', 'Invalid status');
    if (status !== r.status && CLOSED.includes(r.status) && !CLOSED.includes(status)) throw bad('status', 'Request is closed');
    setRequestStatus(c.store.db(), r, status);
    c.store.save();
    return ok(r);
  }],
  ['POST', '/requests/:id/contract', c => {
    const r = requestFor(c, 'contracts', 'create');
    const ct = createContract(c.store.db(), r, c.user.id);
    c.store.save();
    return ok(ct);
  }],
  ['POST', '/requests/:id/invoice', c => {
    const r = requestFor(c, 'invoices', 'create');
    const inv = createInvoice(c.store.db(), r, c.user.id);
    c.store.save();
    return ok(inv, 201);
  }],
  ['POST', '/contracts/:id/sign', c => {
    allow(c, 'contracts', 'edit');
    const ct = locate(c, 'contracts', c.params.id) as Contract;
    ct.signed = true;
    ct.signedAt = ct.signedAt ?? new Date().toISOString();
    c.store.save();
    return ok(ct);
  }],
  ['POST', '/invoices/:id/payments', c => {
    allow(c, 'invoices', 'edit');
    const inv = addPayment(locate(c, 'invoices', c.params.id) as Invoice, objBody(c));
    c.store.save();
    return ok(inv);
  }],

  // ---- generic CRUD ----
  ['GET', '/:col', c => {
    checkCol(c);
    const { col } = c.params, db = c.store.db();
    const kind = c.req.query.kind as 'buy' | 'rent' | undefined;
    if (col !== 'plans') allow(c, moduleFor(col, kind), 'view'); // plans list is open to any signed-in user (plan pickers)
    let rows = scopedList(db, c.user, col);
    if (col === 'requests' && kind) rows = rows.filter(r => r.kind === kind);
    if (NEWEST_FIRST.includes(col)) rows = [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return ok(rows.map(r => strip(col, r)));
  }],

  ['GET', '/:col/:id', c => {
    checkCol(c);
    const { col } = c.params;
    const rec = locate(c, col, c.params.id);
    if (col !== 'plans') allow(c, moduleFor(col, rec.kind), 'view');
    return ok(strip(col, rec));
  }],

  ['POST', '/:col', c => {
    checkCol(c);
    const { col } = c.params, b: Rec = objBody(c);
    allow(c, moduleFor(col, b.kind), 'create');
    if (col === 'requests' && c.user.role === 'client') b.clientId = c.user.linkedId; // clients always request for themselves
    clearEmptyNumbers(b);
    validate(col, b, true);
    const db = c.store.db();
    const rec = build(db, col, b, c.user);
    ((db as unknown as Rec)[col] as Rec[]).push(rec);
    c.store.save();
    return ok(strip(col, rec), 201);
  }],

  ['PUT', '/:col/:id', c => {
    checkCol(c);
    const { col } = c.params, b: Rec = objBody(c);
    const rec = locate(c, col, c.params.id);
    allow(c, moduleFor(col, rec.kind), 'edit');
    clearEmptyNumbers(b);
    validate(col, b, false);
    PROTECTED.forEach(k => delete b[k]);
    if (col === 'properties' && !can(c.store.db().permissions, c.user.role, 'approvals', 'edit')) { delete b.approval; delete b.rejectReason; }
    const ownField = ownerFieldFor(c.user.role);
    if (ownField && col === 'properties') b[ownField] = c.user.linkedId;
    if (ownField && col === 'leads') delete b.assignedTo;
    if (col === 'users' && missing(b.password)) delete b.password;
    Object.assign(rec, b);
    c.store.save();
    return ok(strip(col, rec));
  }],

  ['DELETE', '/:col/:id', c => {
    checkCol(c);
    const { col } = c.params;
    const rec = locate(c, col, c.params.id);
    allow(c, moduleFor(col, rec.kind), 'delete');
    const list = (c.store.db() as unknown as Rec)[col] as Rec[];
    list.splice(list.indexOf(rec), 1);
    c.store.save();
    return ok({ ok: true });
  }],
];

function match(pattern: string, parts: string[]): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean);
  if (pp.length !== parts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) {
      try { params[pp[i].slice(1)] = decodeURIComponent(parts[i]); } catch { return null; }
    } else if (pp[i] !== parts[i]) return null;
  }
  return params;
}

function dispatch(store: Store, req: CoreRequest): CoreResponse {
  const parts = req.path.split('/').filter(Boolean);
  const method = req.method.toUpperCase();
  if (method === 'POST' && parts.length === 2 && parts[0] === 'auth' && parts[1] === 'login') {
    const out = login(store.db(), req.body?.email, req.body?.password);
    store.sessions.set(out.token, out.user.id);
    return ok(out);
  }
  const id = store.sessions.get(req.token ?? '');
  const user = id ? store.db().users.find(u => u.id === id && u.active) : undefined;
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };
  for (const [m, pattern, handler] of routes) {
    if (m !== method) continue;
    const params = match(pattern, parts);
    if (params) return handler({ store, req, params, user });
  }
  return { status: 404, body: { error: 'Not found' } };
}

export function handleRequest(store: Store, req: CoreRequest): CoreResponse {
  try {
    return dispatch(store, req);
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: err.field ? { error: err.message, field: err.field } : { error: err.message } };
    console.error(err);
    return { status: 500, body: { error: 'Internal server error' } };
  }
}
