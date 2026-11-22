import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button, PageHeader, StatusBadge, useToast } from '../components/ui';
import DataTable, { Column } from '../components/DataTable';
import { formatDate, formatINR } from '../../shared/format';
import type { Client, Property, Tenant } from '../../shared/types';

const daysLeft = (end: string) => Math.ceil((new Date(end).getTime() - Date.now()) / 86400000);

export default function Tenants() {
  const { can } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Tenant[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [props, setProps] = useState<Property[]>([]);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<Tenant[]>('/tenants'));
    } catch (e) {
      setRows([]);
      toast((e as Error).message, 'error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
    api.get<Client[]>('/clients').then(setClients).catch(() => setClients([]));
    api.get<Property[]>('/properties').then(setProps).catch(() => setProps([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cname = (id: string) => clients.find(c => c.id === id)?.name ?? '—';
  const prop = (id: string) => props.find(p => p.id === id);

  const mark = async (t: Tenant, status: Tenant['status']) => {
    try {
      await api.put(`/tenants/${t.id}`, { status });
      toast(`${t.referenceNo} marked ${status}`);
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const columns: Column<Tenant>[] = [
    { key: 'referenceNo', label: 'Reference' },
    { key: 'clientId', label: 'Tenant', sortValue: t => cname(t.clientId), render: t => cname(t.clientId) },
    { key: 'propertyId', label: 'Property', sortValue: t => prop(t.propertyId)?.code ?? '',
      render: t => { const p = prop(t.propertyId); return p ? <Link to={`/properties/${p.id}`}>{p.code} – {p.name}</Link> : '—'; } },
    { key: 'monthlyRent', label: 'Monthly rent', render: t => formatINR(t.monthlyRent) },
    { key: 'deposit', label: 'Deposit', render: t => formatINR(t.deposit) },
    { key: 'leaseStart', label: 'Lease start', render: t => formatDate(t.leaseStart) },
    { key: 'leaseEnd', label: 'Lease end', render: t => formatDate(t.leaseEnd) },
    { key: 'daysLeft', label: 'Days left', sortValue: t => daysLeft(t.leaseEnd),
      render: t => { const d = daysLeft(t.leaseEnd); return t.status === 'Ended' ? '—' : <span style={d <= 90 ? { color: '#D64545', fontWeight: 600 } : undefined}>{d}</span>; } },
    { key: 'status', label: 'Status', render: t => <StatusBadge status={t.status} /> },
  ];

  return (
    <>
      <PageHeader title="Tenants" subtitle={`${rows.length} tenancies`} />
      <DataTable columns={columns} rows={rows} exportName="tenants"
        actions={can('tenants', 'edit') ? (t: Tenant) => (
          <>
            {t.status === 'Active' && <Button size="sm" variant="ghost" onClick={() => void mark(t, 'Notice Period')}>Notice Period</Button>}{' '}
            {t.status !== 'Ended' && <Button size="sm" variant="danger" onClick={() => void mark(t, 'Ended')}>Mark Ended</Button>}
          </>
        ) : undefined} />
    </>
  );
}
