import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import DataTable, { Column } from '../components/DataTable';
import FormModal, { Field } from '../components/FormModal';
import { Button, Card, PageHeader, StatusBadge, useToast } from '../components/ui';
import { formatDate, formatINR } from '../../shared/format';
import { REQUEST_STATUSES } from '../../shared/types';
import type { Client, Property, PropertyRequest } from '../../shared/types';

/** Create-request modal; also used by PropertyDetail. */
export function RequestModal({ kind, propertyId, onClose, onDone }: { kind: 'buy' | 'rent'; propertyId?: string; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [props, setProps] = useState<Property[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const isClient = user?.role === 'client';

  useEffect(() => {
    api.get<Property[]>('/properties').then(r => setProps(r.filter(p => p.approval === 'approved' && p.transactionType === (kind === 'buy' ? 'Sale' : 'Rent')))).catch(() => setProps([]));
    if (!isClient) api.get<Client[]>('/clients').then(setClients).catch(() => undefined);
  }, [kind, isClient]);

  if (!props) return null;
  const pre = props.find(p => p.id === propertyId);
  const fields: Field[] = [
    { name: 'propertyId', label: 'Property', type: 'select', required: true, options: props.map(p => ({ value: p.id, label: `${p.code} - ${p.name}` })) },
    ...(isClient ? [] : [{ name: 'clientId', label: 'Client', type: 'select', required: true, options: clients.map(c => ({ value: c.id, label: `${c.name} (${c.code})` })) } as Field]),
    { name: 'contractAmount', label: 'Contract amount', type: 'number', min: 0 },
    ...(kind === 'rent' ? [{ name: 'termMonths', label: 'Term (months)', type: 'number', min: 1 } as Field] : []),
    { name: 'startDate', label: kind === 'buy' ? 'Expected buy date' : 'Preferred lease start', type: 'date', required: true },
    { name: 'endDate', label: 'End date', type: 'date' },
    { name: 'inspect', label: 'Inspect property', type: 'checkbox' },
    { name: 'inspectionDate', label: 'Inspection date', type: 'date' },
    { name: 'clientNote', label: 'Client note', type: 'textarea' },
    { name: 'adminNote', label: 'Admin note', type: 'textarea' },
  ];
  return (
    <FormModal title={kind === 'buy' ? 'New Buy Request' : 'New Rental Request'} fields={fields} submitLabel="Create"
      initial={{ propertyId: propertyId ?? '', contractAmount: pre?.price ?? '', termMonths: 11 }}
      onSubmit={async v => {
        const p = props.find(x => x.id === v.propertyId);
        const body: Record<string, any> = { ...v, kind, propertyPrice: p?.price ?? 0 };
        if (body.contractAmount === '' || body.contractAmount == null) body.contractAmount = p?.price ?? 0;
        if (kind === 'buy') delete body.termMonths;
        await api.post('/requests', body);
        onDone();
      }}
      onClose={onClose} />
  );
}

export default function Requests({ kind }: { kind: 'buy' | 'rent' }) {
  const { can, user } = useAuth();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [rows, setRows] = useState<PropertyRequest[]>([]);
  const [propNames, setPropNames] = useState<Record<string, string>>({});
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [customer, setCustomer] = useState('');
  const [open, setOpen] = useState(!!sp.get('propertyId'));
  const module = kind === 'buy' ? 'buyRequests' : 'rentRequests';

  const load = useCallback(() => {
    api.get<PropertyRequest[]>(`/requests?kind=${kind}`).then(setRows).catch(e => toast(e.message, 'error'));
  }, [kind, toast]);
  useEffect(load, [load]);
  useEffect(() => {
    api.get<Property[]>('/properties').then(r => setPropNames(Object.fromEntries(r.map(p => [p.id, p.name])))).catch(() => undefined);
    if (user?.role !== 'client') api.get<Client[]>('/clients').then(r => setClientNames(Object.fromEntries(r.map(c => [c.id, c.name])))).catch(() => undefined);
  }, [user?.role]);

  const pn = (r: PropertyRequest) => propNames[r.propertyId] ?? '—';
  const cn = (r: PropertyRequest) => clientNames[r.clientId] ?? (r.clientId === user?.linkedId ? user?.name : undefined) ?? '—';
  const filtered = rows.filter(r => (!status || r.status === status) && (!customer || r.clientId === customer));

  const columns: Column<PropertyRequest>[] = [
    { key: 'number', label: 'Number', render: r => <Link to={`/requests/${r.id}`}>{r.number}</Link> },
    { key: 'property', label: 'Property', render: pn, sortValue: pn },
    { key: 'client', label: 'Client', render: cn, sortValue: cn },
    { key: 'propertyPrice', label: 'Property price', render: r => formatINR(r.propertyPrice), sortValue: r => r.propertyPrice },
    { key: 'contractAmount', label: 'Contract amount', render: r => formatINR(r.contractAmount), sortValue: r => r.contractAmount },
    ...(kind === 'rent' ? [{ key: 'termMonths', label: 'Term (months)' } as Column<PropertyRequest>] : []),
    { key: 'createdAt', label: 'Created', render: r => formatDate(r.createdAt), sortValue: r => r.createdAt },
    { key: 'startDate', label: kind === 'buy' ? 'Expected buy date' : 'Preferred lease start', render: r => formatDate(r.startDate), sortValue: r => r.startDate },
    { key: 'endDate', label: 'End date', render: r => formatDate(r.endDate), sortValue: r => r.endDate ?? '' },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
    { key: 'docs', label: 'Contract / Invoice', render: r => `${r.contractId ? 'Contract' : '-'} / ${r.invoiceId ? 'Invoice' : '-'}`, sortValue: r => Number(!!r.contractId) + Number(!!r.invoiceId) },
  ];

  const customers = Object.entries(clientNames);
  return (
    <>
      <PageHeader title={kind === 'buy' ? 'Buy Requests' : 'Rental Requests'}
        actions={can(module, 'create') && <Button onClick={() => setOpen(true)}>New Request</Button>} />
      <Card>
        <div className="filters">
          <select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{REQUEST_STATUSES.map(s => <option key={s}>{s}</option>)}</select>
          {customers.length > 0 && (
            <select value={customer} onChange={e => setCustomer(e.target.value)}><option value="">All customers</option>{customers.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          )}
        </div>
        <DataTable columns={columns} rows={filtered} exportName={`${kind}-requests`} />
      </Card>
      {open && (
        <RequestModal kind={kind} propertyId={sp.get('propertyId') ?? undefined}
          onClose={() => { setOpen(false); if (sp.get('propertyId')) setSp({}, { replace: true }); }}
          onDone={() => { toast('Request created'); load(); }} />
      )}
    </>
  );
}
