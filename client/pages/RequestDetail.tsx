import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button, Card, PageHeader, StatusBadge, useToast } from '../components/ui';
import { formatDate, formatINR } from '../../shared/format';
import { REQUEST_STATUSES } from '../../shared/types';
import type { Client, Property, PropertyRequest } from '../../shared/types';

const CLOSED = ['Cancelled', 'Complete', 'Expired'];

export default function RequestDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const [r, setR] = useState<PropertyRequest | null>(null);
  const [prop, setProp] = useState<Property | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const req = await api.get<PropertyRequest>(`/requests/${id}`);
      setR(req);
      api.get<Property>(`/properties/${req.propertyId}`).then(setProp).catch(() => setProp(null));
      api.get<Client>(`/clients/${req.clientId}`).then(setClient).catch(() => setClient(null));
    } catch (e) { toast((e as Error).message, 'error'); }
  }, [id, toast]);
  useEffect(() => { void load(); }, [load]);

  if (!r) return <Card>Loading...</Card>;
  const module = r.kind === 'buy' ? 'buyRequests' : 'rentRequests';
  const canEdit = can(module, 'edit');
  const closed = CLOSED.includes(r.status);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast(msg); await load(); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const idx = REQUEST_STATUSES.indexOf(r.status);

  return (
    <>
      <PageHeader title={`${r.kind === 'buy' ? 'Buy' : 'Rental'} Request ${r.number}`} subtitle={prop?.name} actions={<StatusBadge status={r.status} />} />
      <Card title="Status">
        <div className="chip-group" aria-label="Status stepper">
          {REQUEST_STATUSES.map((s, i) => <span key={s} className={`chip ${s === r.status ? 'on' : ''}`} style={i < idx ? { opacity: 0.6 } : undefined}>{i + 1}. {s}</span>)}
        </div>
        {canEdit && !closed && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {REQUEST_STATUSES.filter(s => s !== r.status).map(s => (
              <Button key={s} size="sm" variant={s === 'Cancelled' || s === 'Expired' ? 'danger' : s === 'Approved' || s === 'Complete' ? 'success' : 'ghost'} disabled={busy}
                onClick={() => act(() => api.post(`/requests/${r.id}/status`, { status: s }), `Status set to ${s}`)}>Move to {s}</Button>
            ))}
          </div>
        )}
      </Card>
      <Card title="Summary">
        <dl className="kv">
          <div><dt>Property</dt><dd><Link to={`/properties/${r.propertyId}`}>{prop?.name ?? r.propertyId}</Link></dd></div>
          <div><dt>Client</dt><dd>{client?.name ?? '—'}</dd></div>
          <div><dt>Property price</dt><dd>{formatINR(r.propertyPrice)}</dd></div>
          <div><dt>Contract amount</dt><dd>{formatINR(r.contractAmount)}</dd></div>
          {r.kind === 'rent' && <div><dt>Term</dt><dd>{r.termMonths} months</dd></div>}
          <div><dt>{r.kind === 'buy' ? 'Expected buy date' : 'Preferred lease start'}</dt><dd>{formatDate(r.startDate)}</dd></div>
          <div><dt>End date</dt><dd>{formatDate(r.endDate)}</dd></div>
          <div><dt>Inspection</dt><dd>{r.inspect ? `Yes${r.inspectionDate ? ` (${formatDate(r.inspectionDate)})` : ''}` : 'No'}</dd></div>
          <div><dt>Created</dt><dd>{formatDate(r.createdAt)}</dd></div>
        </dl>
      </Card>
      <Card title="Contract and invoice">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {canEdit && <Button disabled={busy} onClick={() => act(() => api.post(`/requests/${r.id}/contract`), 'Contract ready')}>{r.contractId ? 'Open contract record' : 'Generate contract'}</Button>}
          {canEdit && <Button variant="gold" disabled={busy} onClick={() => act(() => api.post(`/requests/${r.id}/invoice`), 'Invoice generated')}>Generate invoice</Button>}
          {r.contractId && <Link to="/contracts">View contracts</Link>}
          {r.invoiceId && <Link to="/invoices">View invoices</Link>}
          {!r.contractId && !r.invoiceId && !canEdit && <span className="muted">No contract or invoice yet.</span>}
        </div>
      </Card>
      <Card title="Notes">
        <dl className="kv">
          <div><dt>Client note</dt><dd>{r.clientNote || '—'}</dd></div>
          <div><dt>Admin note</dt><dd>{r.adminNote || '—'}</dd></div>
        </dl>
      </Card>
    </>
  );
}
