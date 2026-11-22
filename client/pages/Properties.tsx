import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import DataTable, { Column } from '../components/DataTable';
import { Button, Card, ConfirmDialog, PageHeader, StatusBadge, useToast } from '../components/ui';
import { formatShort } from '../../shared/format';
import { PROPERTY_STATUSES } from '../../shared/types';
import type { Property } from '../../shared/types';
import { STYLES } from './PropertyForm';

const initials = (s: string) => s.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

export default function Properties() {
  const { can } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [rows, setRows] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [del, setDel] = useState<Property | null>(null);
  const [f, setF] = useState({ q: '', tx: '', status: '', min: '', max: '', beds: '', style: '' });
  const set = (k: keyof typeof f, v: string) => setF(s => ({ ...s, [k]: v }));

  const load = useCallback(() => {
    api.get<Property[]>('/properties').then(setRows).catch(e => toast(e.message, 'error')).finally(() => setLoading(false));
  }, [toast]);
  useEffect(load, [load]);

  const filtered = useMemo(() => rows.filter(p =>
    (!f.tx || p.transactionType === f.tx) && (!f.status || p.status === f.status) && (!f.style || p.style === f.style) &&
    (!f.min || p.price >= Number(f.min)) && (!f.max || p.price <= Number(f.max)) && (!f.beds || p.beds >= Number(f.beds)) &&
    (!f.q || `${p.name} ${p.code} ${p.city} ${p.project ?? ''}`.toLowerCase().includes(f.q.toLowerCase()))), [rows, f]);

  const columns: Column<Property>[] = [
    { key: 'thumb', label: '', render: p => <div className="thumb" title={p.style} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#D9BD77', fontSize: 11 }}>{initials(p.style)}</div>, sortValue: p => p.style },
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Name', render: p => <Link to={`/properties/${p.id}`}>{p.name}</Link> },
    { key: 'status', label: 'Status', render: p => <StatusBadge status={p.status} /> },
    { key: 'city', label: 'City' },
    { key: 'style', label: 'Style' },
    { key: 'transactionType', label: 'Transaction' },
    { key: 'price', label: 'Price', render: p => formatShort(p.price) + (p.transactionType === 'Rent' ? '/mo' : ''), sortValue: p => p.price },
    { key: 'beds', label: 'Beds' },
    { key: 'areaSqft', label: 'Area (sqft)' },
    { key: 'approval', label: 'Approval', render: p => <StatusBadge status={p.approval} /> },
  ];

  const doDelete = async () => {
    if (!del) return;
    try { await api.del(`/properties/${del.id}`); toast('Property deleted'); setDel(null); load(); }
    catch (e) { toast((e as Error).message, 'error'); setDel(null); }
  };

  return (
    <>
      <PageHeader title="Properties" actions={can('properties', 'create') && <Button onClick={() => nav('/properties/new')}>Add New</Button>} />
      <Card>
        <div className="filters">
          <input placeholder="Keyword" value={f.q} onChange={e => set('q', e.target.value)} />
          <select value={f.tx} onChange={e => set('tx', e.target.value)}><option value="">All transactions</option><option>Sale</option><option>Rent</option></select>
          <select value={f.status} onChange={e => set('status', e.target.value)}><option value="">All statuses</option>{PROPERTY_STATUSES.map(s => <option key={s}>{s}</option>)}</select>
          <input type="number" min={0} placeholder="Min price" value={f.min} onChange={e => set('min', e.target.value)} />
          <input type="number" min={0} placeholder="Max price" value={f.max} onChange={e => set('max', e.target.value)} />
          <input type="number" min={0} placeholder="Min beds" value={f.beds} onChange={e => set('beds', e.target.value)} />
          <select value={f.style} onChange={e => set('style', e.target.value)}><option value="">All styles</option>{STYLES.map(s => <option key={s}>{s}</option>)}</select>
        </div>
        <DataTable columns={columns} rows={filtered} exportName="properties" emptyMessage={loading ? 'Loading...' : undefined}
          actions={p => (
            <>
              <Button size="sm" variant="ghost" onClick={() => nav(`/properties/${p.id}`)}>View</Button>{' '}
              {can('properties', 'edit') && <Button size="sm" variant="ghost" onClick={() => nav(`/properties/${p.id}/edit`)}>Edit</Button>}{' '}
              {can('properties', 'delete') && <Button size="sm" variant="danger" onClick={() => setDel(p)}>Delete</Button>}
            </>
          )} />
      </Card>
      <ConfirmDialog open={!!del} danger title="Delete property" confirmLabel="Delete" message={`Delete ${del?.name}? This cannot be undone.`} onConfirm={doDelete} onCancel={() => setDel(null)} />
    </>
  );
}
