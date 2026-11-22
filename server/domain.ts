import { LEAD_STATUSES } from '../shared/types';
import type { Contract, DB, Invoice, Payment, PropertyRequest, RequestStatus, Settings, Tenant } from '../shared/types';
import { HttpError } from './auth';

type Rec = Record<string, any>;
const DAY = 86400000;
export const newId = () => globalThis.crypto.randomUUID().slice(0, 8);
export const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(new Date(iso).getTime() + n * DAY).toISOString().slice(0, 10);
const addMonths = (iso: string, n: number) => { const d = new Date(iso); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const paidOf = (i: Invoice) => sum((i.payments ?? []).map(p => p.amount));

/** Next code like SRP-0041 from settings.prefixes + nextNumbers. */
export function nextCode(s: Settings, key: keyof Settings['prefixes']): string {
  const n = s.nextNumbers[key] ?? 1;
  s.nextNumbers[key] = n + 1;
  return s.prefixes[key] + String(n).padStart(4, '0');
}

/** collection -> [prefix key, field that holds the code] */
export const CODE_FIELD: Record<string, [keyof Settings['prefixes'], string]> = {
  properties: ['property', 'code'], owners: ['owner', 'code'], agents: ['agent', 'code'], brokers: ['broker', 'code'],
  staff: ['staff', 'code'], clients: ['client', 'code'], tenants: ['tenant', 'referenceNo'],
  contracts: ['contract', 'number'], invoices: ['invoice', 'number'],
};

export function setRequestStatus(db: DB, req: PropertyRequest, status: RequestStatus) {
  req.status = status;
  const prop = db.properties.find(p => p.id === req.propertyId);
  if (req.kind === 'rent' && status === 'Approved') {
    if (!db.tenants.some(t => t.requestId === req.id)) {
      const monthlyRent = Math.round(req.contractAmount / (req.termMonths || 1));
      const tenant: Tenant = {
        id: newId(), createdAt: new Date().toISOString(), referenceNo: nextCode(db.settings, 'tenant'),
        clientId: req.clientId, propertyId: req.propertyId, requestId: req.id, leaseStart: req.startDate,
        leaseEnd: req.endDate ?? addMonths(req.startDate, req.termMonths || 1), monthlyRent, deposit: monthlyRent * 2, status: 'Active',
      };
      db.tenants.push(tenant);
    }
    if (prop) prop.status = 'Rented';
  }
  if (req.kind === 'buy' && status === 'Complete' && prop) prop.status = 'Sold';
}

export function createContract(db: DB, req: PropertyRequest, userId: string): Contract {
  const existing = req.contractId && db.contracts.find(c => c.id === req.contractId);
  if (existing) return existing;
  const c: Contract = {
    id: newId(), createdAt: new Date().toISOString(), createdBy: userId, number: nextCode(db.settings, 'contract'), requestId: req.id,
    kind: req.kind, clientId: req.clientId, propertyId: req.propertyId, amount: req.contractAmount, signed: false,
  };
  db.contracts.push(c);
  req.contractId = c.id;
  return c;
}

export function createInvoice(db: DB, req: PropertyRequest, userId: string): Invoice {
  const prop = db.properties.find(p => p.id === req.propertyId);
  const amount = req.kind === 'buy'
    ? prop?.reservationAmount || Math.round(req.contractAmount * 0.1)
    : Math.round(req.contractAmount / (req.termMonths || 1));
  const inv: Invoice = {
    id: newId(), createdAt: new Date().toISOString(), createdBy: userId, number: nextCode(db.settings, 'invoice'), requestId: req.id,
    kind: req.kind, clientId: req.clientId, propertyId: req.propertyId, amount, dueDate: addDays(today(), 7), payments: [], status: 'Unpaid',
  };
  db.invoices.push(inv);
  req.invoiceId = inv.id;
  return inv;
}

const MODES = ['UPI', 'NEFT', 'RTGS', 'Cheque', 'Cash'];
export function addPayment(inv: Invoice, body: Rec): Invoice {
  const amount = Number(body.amount);
  if (!(amount > 0)) throw new HttpError(400, 'Amount must be greater than 0', 'amount');
  if (inv.status === 'Cancelled') throw new HttpError(400, 'Invoice is cancelled', 'invoice');
  if (amount > inv.amount - paidOf(inv)) throw new HttpError(400, 'Amount exceeds balance', 'amount');
  if (!MODES.includes(body.mode)) throw new HttpError(400, 'Invalid payment mode', 'mode');
  const p: Payment = { date: body.date || today(), amount, mode: body.mode, ref: body.ref };
  inv.payments.push(p);
  inv.status = paidOf(inv) >= inv.amount ? 'Paid' : 'Partially Paid';
  return inv;
}

const count = (items: string[]) => {
  const m = new Map<string, number>();
  items.forEach(i => m.set(i, (m.get(i) ?? 0) + 1));
  return [...m].map(([name, value]) => ({ name, value }));
};

/** Start date (YYYY-MM-DD) of a dashboard period; undefined = all time (also for unknown values). */
function periodStart(period: string): string | undefined {
  const d = new Date();
  if (period === 'month') d.setUTCDate(1);
  else if (period === '3m') { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 2); }
  else if (period === 'year') d.setUTCMonth(0, 1);
  else return undefined;
  return d.toISOString().slice(0, 10);
}

/** Aggregates over already-scoped lists. */
export function dashboard(props: Rec[], requests: Rec[], invoices: Invoice[], leads: Rec[], period = 'all') {
  const from = periodStart(period);
  if (from) {
    requests = requests.filter(r => r.createdAt.slice(0, 10) >= from);
    leads = leads.filter(l => l.createdAt.slice(0, 10) >= from);
    invoices = invoices.map(i => ({ ...i, payments: (i.payments ?? []).filter(p => p.date >= from) }));
  }
  const income = (kind: string) => sum(invoices.filter(i => i.kind === kind).map(paidOf));
  const listed = (type: string) => props.filter(p => p.transactionType === type && ['Active', 'New'].includes(p.status)).length;
  const byId = new Map(props.map(p => [p.id, p]));
  const month = new Date().toISOString().slice(0, 7);
  return {
    saleIncome: income('buy'), rentalIncome: income('rent'),
    forSale: listed('Sale'), sold: props.filter(p => p.status === 'Sold').length,
    selling: props.filter(p => p.status === 'Pending Sale').length,
    forLease: listed('Rent'), rented: props.filter(p => p.status === 'Rented').length,
    available: props.filter(p => ['Active', 'New'].includes(p.status)).length,
    propertyByStatus: count(props.map(p => p.status)),
    buyByStatus: count(requests.filter(r => r.kind === 'buy').map(r => r.status)),
    rentByStatus: count(requests.filter(r => r.kind === 'rent').map(r => r.status)),
    requestsByListingType: count(requests.map(r => byId.get(r.propertyId)?.listingType ?? 'Other')),
    topCities: count(props.map(p => p.city)).sort((a, b) => b.value - a.value).slice(0, 5),
    leadsByStatus: LEAD_STATUSES.map(name => ({ name, value: leads.filter(l => l.status === name).length })),
    leadsBySource: count(leads.map(l => l.source)),
    recentLeads: [...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    leadsThisMonth: leads.filter(l => l.createdAt.startsWith(month)).length,
    siteVisitsScheduled: leads.filter(l => l.status === 'Site Visit Scheduled').length,
  };
}

export const REPORT_TYPES = ['rent-paid', 'vacant-rental', 'rental-units', 'delinquent-tenants', 'leases-ending', 'vacant-sale', 'sold-units', 'lead-funnel'];

export function report(db: DB, type: string): { columns: string[]; rows: any[][] } {
  const client = (id: string) => db.clients.find(c => c.id === id)?.name ?? '';
  const prop = (id: string) => db.properties.find(p => p.id === id);
  const t = today();
  const listed = (kind: string) => db.properties.filter(p => p.transactionType === kind && p.approval === 'approved' && ['Active', 'New'].includes(p.status));
  const propRow = (p: Rec) => [p.code, p.name, p.city, p.style, p.status, p.transactionType === 'Rent' ? p.rentalPrice ?? p.price : p.price];
  const propCols = ['Code', 'Property', 'City', 'Style', 'Status', 'Price'];
  switch (type) {
    case 'rent-paid':
      return { columns: ['Invoice', 'Client', 'Property', 'Amount', 'Paid', 'Last payment'],
        rows: db.invoices.filter(i => i.kind === 'rent' && i.payments.length).map(i =>
          [i.number, client(i.clientId), prop(i.propertyId)?.name, i.amount, paidOf(i), i.payments[i.payments.length - 1].date]) };
    case 'vacant-rental': return { columns: propCols, rows: listed('Rent').map(propRow) };
    case 'rental-units':
      return { columns: [...propCols, 'Tenant'], rows: db.properties.filter(p => p.transactionType === 'Rent').map(p => {
        const tn = db.tenants.find(x => x.propertyId === p.id && x.status !== 'Ended');
        return [...propRow(p), tn ? client(tn.clientId) : ''];
      }) };
    case 'delinquent-tenants':
      return { columns: ['Invoice', 'Client', 'Property', 'Due date', 'Balance'],
        rows: db.invoices.filter(i => i.kind === 'rent' && i.status !== 'Cancelled' && i.status !== 'Paid' && i.dueDate < t).map(i =>
          [i.number, client(i.clientId), prop(i.propertyId)?.name, i.dueDate, i.amount - paidOf(i)]) };
    case 'leases-ending': {
      const limit = addDays(t, 90);
      return { columns: ['Reference', 'Client', 'Property', 'Lease end', 'Monthly rent'],
        rows: db.tenants.filter(x => x.status !== 'Ended' && x.leaseEnd >= t && x.leaseEnd <= limit).map(x =>
          [x.referenceNo, client(x.clientId), prop(x.propertyId)?.name, x.leaseEnd, x.monthlyRent]) };
    }
    case 'vacant-sale': return { columns: propCols, rows: listed('Sale').map(propRow) };
    case 'sold-units': return { columns: propCols, rows: db.properties.filter(p => ['Sold', 'Closed Sale'].includes(p.status)).map(propRow) };
    case 'lead-funnel':
      return { columns: ['Status', 'Leads', 'Share %'], rows: LEAD_STATUSES.map(s => {
        const n = db.leads.filter(l => l.status === s).length;
        return [s, n, db.leads.length ? Math.round((n / db.leads.length) * 100) : 0];
      }) };
    default: throw new HttpError(404, 'Unknown report');
  }
}
