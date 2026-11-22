import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Button, PageHeader, StatusBadge, useToast } from '../components/ui';
import DataTable, { Column } from '../components/DataTable';
import FormModal from '../components/FormModal';
import { formatDate, formatINR } from '../../shared/format';
import type { Client, Contract, Invoice, Property } from '../../shared/types';

const paid = (i: Invoice) => i.payments.reduce((s, p) => s + p.amount, 0);
const MODES = ['UPI', 'NEFT', 'RTGS', 'Cheque', 'Cash'].map(v => ({ value: v, label: v }));

function useLookups() {
  const [clients, setClients] = useState<Client[]>([]);
  const [props, setProps] = useState<Property[]>([]);
  useEffect(() => {
    api.get<Client[]>('/clients').then(setClients).catch(() => setClients([]));
    api.get<Property[]>('/properties').then(setProps).catch(() => setProps([]));
  }, []);
  return {
    cname: (id: string) => clients.find(c => c.id === id)?.name ?? '—',
    prop: (id: string) => {
      const p = props.find(x => x.id === id);
      return { label: p ? `${p.code} – ${p.name}` : '—', node: p ? <Link to={`/properties/${p.id}`}>{p.code} – {p.name}</Link> : <>—</> };
    },
  };
}

export default function Invoices() {
  const { can } = useAuth();
  const toast = useToast();
  const { cname, prop } = useLookups();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [viewFor, setViewFor] = useState<Invoice | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<Invoice[]>('/invoices'));
    } catch (e) {
      setRows([]);
      toast((e as Error).message, 'error');
    }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const columns: Column<Invoice>[] = [
    { key: 'number', label: 'Number' },
    { key: 'clientId', label: 'Client', sortValue: i => cname(i.clientId), render: i => cname(i.clientId) },
    { key: 'propertyId', label: 'Property', sortValue: i => prop(i.propertyId).label, render: i => prop(i.propertyId).node },
    { key: 'kind', label: 'Kind' },
    { key: 'amount', label: 'Amount', render: i => formatINR(i.amount) },
    { key: 'paid', label: 'Paid', sortValue: paid, render: i => formatINR(paid(i)) },
    { key: 'balance', label: 'Balance', sortValue: i => i.amount - paid(i), render: i => formatINR(i.amount - paid(i)) },
    { key: 'dueDate', label: 'Due date', render: i => formatDate(i.dueDate) },
    { key: 'status', label: 'Status', render: i => (i.status === 'Overdue' ? <strong><StatusBadge status="Overdue" /></strong> : <StatusBadge status={i.status} />) },
  ];

  return (
    <>
      <PageHeader title="Invoices" subtitle={`${rows.length} invoices`} />
      <DataTable columns={columns} rows={rows} exportName="invoices"
        actions={(i: Invoice) => (
          <>
            <Button size="sm" variant="ghost" onClick={() => setViewFor(i)}>View payments</Button>{' '}
            {can('invoices', 'edit') && i.status !== 'Paid' && i.status !== 'Cancelled' && i.amount - paid(i) > 0 &&
              <Button size="sm" variant="success" onClick={() => setPayFor(i)}>Record payment</Button>}
          </>
        )} />
      {payFor && (
        <FormModal title={`Record payment – ${payFor.number}`} submitLabel="Record"
          fields={[
            { name: 'date', label: 'Date', type: 'date', required: true },
            { name: 'amount', label: `Amount (balance ${formatINR(payFor.amount - paid(payFor))})`, type: 'number', required: true, min: 1 },
            { name: 'mode', label: 'Mode', type: 'select', options: MODES, required: true },
            { name: 'ref', label: 'Reference', type: 'text' },
          ]}
          initial={{ date: new Date().toISOString().slice(0, 10), amount: payFor.amount - paid(payFor), mode: 'UPI' }}
          onSubmit={async v => {
            const balance = payFor.amount - paid(payFor);
            if (!(v.amount > 0) || v.amount > balance) throw new Error(`Amount must be between 1 and ${formatINR(balance)}`);
            try {
              await api.post(`/invoices/${payFor.id}/payments`, v);
            } catch (err) {
              toast((err as Error).message, 'error');
              throw err;
            }
            toast('Payment recorded');
            await load();
          }}
          onClose={() => setPayFor(null)} />
      )}
      {viewFor && (
        <div className="modal-backdrop" onClick={() => setViewFor(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>Payments – {viewFor.number}</h3><button type="button" className="icon-btn" aria-label="Close" onClick={() => setViewFor(null)}>×</button></div>
            <div className="modal-body">
              {viewFor.payments.length === 0 ? <div className="empty">No payments recorded.</div> : (
                <table className="table">
                  <thead><tr><th>Date</th><th>Amount</th><th>Mode</th><th>Ref</th></tr></thead>
                  <tbody>{viewFor.payments.map((p, k) => (
                    <tr key={k}><td>{formatDate(p.date)}</td><td>{formatINR(p.amount)}</td><td>{p.mode}</td><td>{p.ref || '—'}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
            <div className="modal-foot"><Button variant="ghost" onClick={() => setViewFor(null)}>Close</Button></div>
          </div>
        </div>
      )}
    </>
  );
}

export function Contracts() {
  const { can } = useAuth();
  const toast = useToast();
  const { cname, prop } = useLookups();
  const [rows, setRows] = useState<Contract[]>([]);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<Contract[]>('/contracts'));
    } catch (e) {
      setRows([]);
      toast((e as Error).message, 'error');
    }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const sign = async (c: Contract) => {
    try {
      await api.post(`/contracts/${c.id}/sign`);
      toast(`${c.number} signed`);
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const columns: Column<Contract>[] = [
    { key: 'number', label: 'Number' },
    { key: 'kind', label: 'Kind' },
    { key: 'clientId', label: 'Client', sortValue: c => cname(c.clientId), render: c => cname(c.clientId) },
    { key: 'propertyId', label: 'Property', sortValue: c => prop(c.propertyId).label, render: c => prop(c.propertyId).node },
    { key: 'amount', label: 'Amount', render: c => formatINR(c.amount) },
    { key: 'signed', label: 'Signed', sortValue: c => (c.signed ? 1 : 0), render: c => <Badge color={c.signed ? 'green' : 'amber'}>{c.signed ? 'Signed' : 'Unsigned'}</Badge> },
    { key: 'signedAt', label: 'Signed at', sortValue: c => c.signedAt ?? '', render: c => (c.signedAt ? formatDate(c.signedAt) : '—') },
  ];

  return (
    <>
      <PageHeader title="Contracts" subtitle={`${rows.length} contracts`} />
      <DataTable columns={columns} rows={rows} exportName="contracts"
        actions={can('contracts', 'edit') ? (c: Contract) => (!c.signed ? <Button size="sm" variant="success" onClick={() => void sign(c)}>Mark signed</Button> : null) : undefined} />
    </>
  );
}
