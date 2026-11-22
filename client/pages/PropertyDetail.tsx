import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button, Card, PageHeader, StatusBadge, useToast } from '../components/ui';
import { formatDate, formatINR, formatShort } from '../../shared/format';
import type { Property, PropertyRequest } from '../../shared/types';
import { RequestModal } from './Requests';

export default function PropertyDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [p, setP] = useState<Property | null>(null);
  const [names, setNames] = useState<{ owner?: string; agent?: string; broker?: string }>({});
  const [reqs, setReqs] = useState<PropertyRequest[]>([]);
  const [modal, setModal] = useState(false);

  const load = useCallback(() => {
    api.get<Property>(`/properties/${id}`).then(prop => {
      setP(prop);
      for (const [k, col, pid] of [['owner', 'owners', prop.ownerId], ['agent', 'agents', prop.agentId], ['broker', 'brokers', prop.brokerId]] as const) {
        if (pid) api.get<{ name: string }>(`/${col}/${pid}`).then(r => setNames(s => ({ ...s, [k]: r.name }))).catch(() => undefined);
      }
    }).catch(e => toast(e.message, 'error'));
    api.get<PropertyRequest[]>('/requests').then(r => setReqs(r.filter(x => x.propertyId === id))).catch(() => setReqs([]));
  }, [id, toast]);
  useEffect(load, [load]);

  if (!p) return <Card>Loading...</Card>;
  const rent = p.transactionType === 'Rent';
  const reqModule = rent ? 'rentRequests' : 'buyRequests';
  const total = p.expenses.reduce((s, x) => s + x.amount, 0);
  const kv = (label: string, val: React.ReactNode) => <div key={label}><dt>{label}</dt><dd>{val ?? '—'}</dd></div>;

  return (
    <>
      <PageHeader title={p.name} subtitle={p.project}
        actions={<>
          {can('properties', 'edit') && <Button onClick={() => nav(`/properties/${p.id}/edit`)}>Edit</Button>}{' '}
          {can(reqModule, 'create') && p.approval === 'approved' && <Button variant="gold" onClick={() => setModal(true)}>{rent ? 'Create rental request' : 'Create buy request'}</Button>}
        </>} />
      <div className="hero">
        <div>
          <div>{p.name}</div>
          <div style={{ fontSize: 14, fontFamily: 'inherit', display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <span>{p.code}</span><StatusBadge status={p.status} /><StatusBadge status={p.approval} />
            <strong>{formatINR(p.price)}{rent ? '/mo' : ''}</strong>
          </div>
        </div>
      </div>
      {p.approval === 'rejected' && p.rejectReason && <div className="form-error">Rejected: {p.rejectReason}</div>}
      <Card title="Key facts">
        <dl className="kv">
          {kv('Transaction', p.transactionType)}{kv('Price', formatShort(p.price) + (rent ? '/mo' : ''))}{kv('Style', p.style)}{kv('Listing type', p.listingType)}
          {kv('Beds', p.beds)}{kv('Baths', p.baths)}{kv('Area (sqft)', p.areaSqft)}{kv('Plot (sqft)', p.plotSqft)}{kv('Floors', p.floors)}{kv('Facing', p.facing)}
          {kv('Furnished', p.furnished)}{kv('Condition', p.condition)}{kv('New construction', p.newConstruction ? 'Yes' : 'No')}{kv('Year built', p.yearBuilt)}
          {kv('Possession', p.possessionDate ? formatDate(p.possessionDate) : undefined)}{kv('Reservation amount', p.reservationAmount != null ? formatINR(p.reservationAmount) : undefined)}
          {kv('Maintenance fee', p.maintenanceFee != null ? formatINR(p.maintenanceFee) : undefined)}{kv('Privacy', p.listingPrivacy)}
          {kv('Address', [p.address, p.city, p.state, p.zip].filter(Boolean).join(', '))}
          {kv('Owner', names.owner)}{kv('Agent', names.agent)}{kv('Broker', names.broker)}
        </dl>
        {p.description && <p style={{ marginTop: 12 }}>{p.description}</p>}
        {p.lat != null && p.lng != null && <p><a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">Open in Google Maps</a></p>}
      </Card>
      <Card title="Amenities">
        {p.amenities.length ? <div className="chip-group">{p.amenities.map(a => <span key={a} className="chip on">{a}</span>)}</div> : <span className="muted">None listed.</span>}
      </Card>
      <div className="grid-2">
        <Card title="Rooms">
          <table className="table"><thead><tr><th>Type</th><th>Level</th><th>Size (ft)</th></tr></thead>
            <tbody>{p.rooms.map((r, i) => <tr key={i}><td>{r.type}</td><td>{r.level}</td><td>{r.widthFt} x {r.lengthFt}</td></tr>)}</tbody></table>
          {!p.rooms.length && <span className="muted">No rooms.</span>}
        </Card>
        <Card title="Expenses">
          <table className="table"><thead><tr><th>Label</th><th>Amount</th></tr></thead>
            <tbody>{p.expenses.map((x, i) => <tr key={i}><td>{x.label}</td><td>{formatINR(x.amount)}</td></tr>)}</tbody>
            <tfoot><tr><th>Total</th><th>{formatINR(total)}</th></tr></tfoot></table>
        </Card>
      </div>
      <Card title="Related requests">
        {reqs.length ? (
          <table className="table"><thead><tr><th>Number</th><th>Kind</th><th>Contract amount</th><th>Status</th></tr></thead>
            <tbody>{reqs.map(r => <tr key={r.id}><td><Link to={`/requests/${r.id}`}>{r.number}</Link></td><td>{r.kind}</td><td>{formatINR(r.contractAmount)}</td><td><StatusBadge status={r.status} /></td></tr>)}</tbody></table>
        ) : <span className="muted">No requests for this property.</span>}
      </Card>
      {modal && <RequestModal kind={rent ? 'rent' : 'buy'} propertyId={p.id} onClose={() => setModal(false)} onDone={() => { toast('Request created'); load(); }} />}
    </>
  );
}
