import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button, ConfirmDialog, PageHeader, StatusBadge, Tabs, useToast } from '../components/ui';
import DataTable, { Column } from '../components/DataTable';
import FormModal, { Field, FormValues } from '../components/FormModal';
import { formatDate, formatShort, isIndianMobile } from '../../shared/format';
import { LEAD_SOURCES, LEAD_STATUSES } from '../../shared/types';
import type { Client, Lead, LeadStatus, Property } from '../../shared/types';

type UserLite = { id: string; name: string; role: string };
const INTERESTS = ['Riora 4BHK', 'Avira 4BHK', 'Selora 4BHK', 'Elora 5BHK', 'Rental – 2BHK', 'Rental – 3BHK', 'Commercial'];
const opts = (a: string[]) => a.map(v => ({ value: v, label: v }));

export default function Leads() {
  const { can } = useAuth();
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<UserLite[] | null>(null);
  const [props, setProps] = useState<Property[]>([]);
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [fStatus, setFStatus] = useState('');
  const [fSource, setFSource] = useState('');
  const [fAssigned, setFAssigned] = useState('');
  const [modal, setModal] = useState<{ lead?: Lead } | null>(null);
  const [visit, setVisit] = useState<Lead | null>(null);
  const [del, setDel] = useState<Lead | null>(null);

  const load = useCallback(async () => {
    try {
      setLeads(await api.get<Lead[]>('/leads'));
    } catch (e) {
      setLeads([]);
      toast((e as Error).message, 'error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
    api.get<UserLite[]>('/users').then(setUsers).catch(() => setUsers(null));
    api.get<Property[]>('/properties').then(setProps).catch(() => setProps([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const assignees = useMemo(() => (users ?? []).filter(u => ['staff', 'agent', 'broker'].includes(u.role)), [users]);
  const userName = (id?: string) => (id ? users?.find(u => u.id === id)?.name ?? '—' : '—');
  const canEdit = can('leads', 'edit');

  const filtered = useMemo(() => leads.filter(l =>
    (!fStatus || l.status === fStatus) && (!fSource || l.source === fSource) && (!fAssigned || l.assignedTo === fAssigned)), [leads, fStatus, fSource, fAssigned]);

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn();
      toast(okMsg);
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const setStatus = (l: Lead, status: string) => run(() => api.put(`/leads/${l.id}`, { status }), `${l.name} moved to ${status}`);

  const convert = (l: Lead) => run(async () => {
    const c = await api.post<Client>('/clients', { name: l.name, phone: l.phone, email: l.email ?? '', type: 'Buyer' });
    await api.put(`/leads/${l.id}`, { status: 'Booked' });
    toast(`Converted to client ${c.code}`);
  }, `${l.name} booked`);

  const fields: Field[] = [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'phone', label: 'Phone', type: 'tel', required: true },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'source', label: 'Source', type: 'select', options: opts(LEAD_SOURCES), required: true },
    { name: 'interest', label: 'Interest', type: 'select', options: opts(INTERESTS) },
    { name: 'budget', label: 'Budget (₹)', type: 'number', min: 0 },
    { name: 'status', label: 'Status', type: 'select', options: opts(LEAD_STATUSES) },
    ...(users ? [{ name: 'assignedTo', label: 'Assigned to', type: 'select' as const, options: assignees.map(u => ({ value: u.id, label: `${u.name} (${u.role})` })) }] : []),
    { name: 'siteVisitDate', label: 'Site visit date', type: 'date' },
    { name: 'propertyId', label: 'Property (optional)', type: 'select', options: props.map(p => ({ value: p.id, label: `${p.code} – ${p.name}` })) },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];

  const submit = async (v: FormValues) => {
    if (!isIndianMobile(String(v.phone).trim())) throw new Error('Enter a valid 10-digit Indian mobile number');
    const email = String(v.email ?? '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address');
    const editing = modal?.lead;
    const body = { ...v, status: v.status || 'New' };
    if (editing) await api.put(`/leads/${editing.id}`, body);
    else await api.post('/leads', body);
    toast(`Lead ${editing ? 'updated' : 'added'}`);
    await load();
  };

  const actions = (l: Lead) => (
    <>
      {canEdit && <Button size="sm" variant="ghost" onClick={() => setModal({ lead: l })}>Edit</Button>}{' '}
      {canEdit && <Button size="sm" variant="ghost" onClick={() => setVisit(l)}>Schedule site visit</Button>}{' '}
      {can('clients', 'create') && l.status !== 'Booked' && <Button size="sm" variant="success" onClick={() => void convert(l)}>Convert to client</Button>}{' '}
      {can('leads', 'delete') && <Button size="sm" variant="danger" onClick={() => setDel(l)}>Delete</Button>}
    </>
  );

  const columns: Column<Lead>[] = [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'source', label: 'Source' },
    { key: 'interest', label: 'Interest' },
    { key: 'budget', label: 'Budget', sortValue: l => l.budget ?? 0, render: l => (l.budget ? formatShort(l.budget) : '—') },
    { key: 'status', label: 'Status', render: l => <StatusBadge status={l.status} /> },
    { key: 'assignedTo', label: 'Assigned to', sortValue: l => userName(l.assignedTo), render: l => userName(l.assignedTo) },
    { key: 'siteVisitDate', label: 'Site visit', sortValue: l => l.siteVisitDate ?? '', render: l => (l.siteVisitDate ? formatDate(l.siteVisitDate) : '—') },
    { key: 'createdAt', label: 'Created', sortValue: l => l.createdAt, render: l => formatDate(l.createdAt) },
  ];

  return (
    <>
      <PageHeader title="Leads" subtitle={`${filtered.length} of ${leads.length} leads`}
        actions={can('leads', 'create') && <Button onClick={() => setModal({})}>Add Lead</Button>} />
      <div className="filters">
        <select aria-label="Filter status" value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">All statuses</option>{LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Filter source" value={fSource} onChange={e => setFSource(e.target.value)}>
          <option value="">All sources</option>{LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {users && (
          <select aria-label="Filter assigned" value={fAssigned} onChange={e => setFAssigned(e.target.value)}>
            <option value="">All assignees</option>{assignees.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
      </div>
      <Tabs tabs={[{ id: 'table', label: 'Table' }, { id: 'kanban', label: 'Kanban' }]} active={view} onChange={setView} />
      {view === 'table' ? (
        <DataTable columns={columns} rows={filtered} actions={actions} exportName="leads" />
      ) : (
        <div className="kanban">
          {LEAD_STATUSES.map(st => {
            const col = filtered.filter(l => l.status === st);
            const total = col.reduce((s, l) => s + (l.budget ?? 0), 0);
            return (
              <div key={st} className="kanban-col">
                <div className="kanban-head"><StatusBadge status={st} /> <strong>{col.length}</strong> <span className="muted">{formatShort(total)}</span></div>
                {col.map(l => (
                  <div key={l.id} className="kanban-card card">
                    <strong>{l.name}</strong>
                    <div>{l.interest || '—'}</div>
                    <div>{l.budget ? formatShort(l.budget) : '—'} · {l.source}</div>
                    <div className="muted">{userName(l.assignedTo)}</div>
                    {canEdit && (
                      <select aria-label={`Status for ${l.name}`} value={l.status} onChange={e => void setStatus(l, e.target.value as LeadStatus)}>
                        {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    <div>{actions(l)}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {modal && (
        <FormModal title={modal.lead ? 'Edit Lead' : 'Add Lead'} fields={fields} initial={modal.lead ?? { status: 'New' }} onSubmit={submit} onClose={() => setModal(null)} />
      )}
      {visit && (
        <FormModal title={`Schedule site visit – ${visit.name}`} submitLabel="Schedule"
          fields={[{ name: 'siteVisitDate', label: 'Visit date', type: 'date', required: true }]} initial={{ siteVisitDate: visit.siteVisitDate }}
          onSubmit={async v => {
            await api.put(`/leads/${visit.id}`, { status: 'Site Visit Scheduled', siteVisitDate: v.siteVisitDate });
            toast('Site visit scheduled');
            await load();
          }}
          onClose={() => setVisit(null)} />
      )}
      <ConfirmDialog open={!!del} danger confirmLabel="Delete" title="Delete lead" message={`Delete lead ${del?.name ?? ''}?`}
        onConfirm={async () => { const l = del!; setDel(null); await run(() => api.del(`/leads/${l.id}`), 'Lead deleted'); }} onCancel={() => setDel(null)} />
    </>
  );
}
