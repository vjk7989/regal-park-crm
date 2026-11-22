import { can } from '../shared/permissions';
import { entityByKey } from '../shared/registry';
import type { DB, User } from '../shared/types';
import { calendarItems } from './xcore';

type Rec = Record<string, any>;
const OPEN_INVOICE = ['Unpaid', 'Partially Paid', 'Overdue'];
const sum = (rows: Rec[], f = 'amount') => rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);

/** Status counts in the entity's REGISTRY option order. */
function overview(rows: Rec[], entity: string) {
  const f = entityByKey(entity)?.fields.find(x => x.key === entityByKey(entity)?.statusField);
  const total = rows.length;
  return (f?.options ?? []).map(status => {
    const count = rows.filter(r => r.status === status).length;
    return { status, count, percent: total ? Math.round((count / total) * 100) : 0 };
  });
}
const tally = (rows: Rec[], key: string) => {
  const m = new Map<string, number>();
  for (const r of rows) { const k = String(r[key] ?? '-'); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].map(([name, value]) => ({ name, value }));
};

export function overviewFor(db: DB, user: User) {
  const x = (k: string): Rec[] => db.x?.[k] ?? [];
  const invoices = x('sales_invoices'), projects = x('projects_projects'), tasks = x('tasks_tasks'), leads = db.leads ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const open = tasks.filter(t => t.status !== 'Complete');
  const mine = open.filter(t => t.assignedTo === user.id), rest = open.filter(t => t.assignedTo !== user.id);
  const pastDue = invoices.filter(i => OPEN_INVOICE.includes(i.status) && (i.status === 'Overdue' || (i.dueDate && i.dueDate < today)));
  return {
    bars: [
      { label: 'Invoices Awaiting Payment', value: invoices.filter(i => OPEN_INVOICE.includes(i.status)).length, total: invoices.length },
      { label: 'Converted Leads', value: leads.filter(l => l.status === 'Booked').length, total: leads.length },
      { label: 'Projects In Progress', value: projects.filter(p => p.status === 'In Progress').length, total: projects.length },
      { label: 'Tasks Not Finished', value: open.length, total: tasks.length },
    ],
    invoiceOverview: overview(invoices, 'sales_invoices'),
    estimateOverview: overview(x('sales_estimates'), 'sales_estimates'),
    proposalOverview: overview(x('sales_proposals'), 'sales_proposals'),
    totals: {
      outstanding: sum(invoices.filter(i => OPEN_INVOICE.includes(i.status))),
      pastDue: sum(pastDue),
      paid: sum(invoices.filter(i => i.status === 'Paid')),
    },
    leadsByStatus: tally(leads, 'status'),
    projectsByStatus: tally(projects, 'status'),
    myTasks: [...mine, ...rest].slice(0, 8).map(t => ({ id: t.id, name: t.name, status: t.status, dueDate: t.dueDate, priority: t.priority, mine: t.assignedTo === user.id })),
    upcoming: calendarItems(db, user.role, today, '').slice(0, 8),
  };
}

export const canSeeOverview = (db: DB, user: User) => can(db.permissions, user.role, 'm:sales', 'view') || can(db.permissions, user.role, 'm:projects', 'view');
