import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import DataTable, { Column } from '../components/DataTable';
import FormModal from '../components/FormModal';
import { Button, Card, PageHeader, Tabs, useToast } from '../components/ui';
import { formatDate, formatShort } from '../../shared/format';
import type { Property } from '../../shared/types';

type Tab = 'pending' | 'rejected' | 'approved';

export default function Approvals() {
  const { can } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('pending');
  const [rows, setRows] = useState<Property[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<Property | null>(null);
  const canEdit = can('approvals', 'edit');

  const load = useCallback(() => {
    api.get<Property[]>('/properties').then(setRows).catch(e => toast(e.message, 'error'));
  }, [toast]);
  useEffect(load, [load]);
  useEffect(() => {
    api.get<{ id: string; name: string }[]>('/users').then(u => setNames(Object.fromEntries(u.map(x => [x.id, x.name])))).catch(() => undefined);
  }, []);

  const approve = async (p: Property) => {
    try { await api.post(`/properties/${p.id}/approve`); toast(`${p.name} approved`); load(); }
    catch (e) { toast((e as Error).message, 'error'); }
  };

  const who = (p: Property) => (p.createdBy && names[p.createdBy]) || p.createdBy || '—';
  const columns: Column<Property>[] = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Name', render: p => <Link to={`/properties/${p.id}`}>{p.name}</Link> },
    { key: 'createdBy', label: 'Created by', render: who, sortValue: who },
    { key: 'createdAt', label: 'Date', render: p => formatDate(p.createdAt), sortValue: p => p.createdAt },
    { key: 'price', label: 'Price', render: p => formatShort(p.price), sortValue: p => p.price },
    ...(tab === 'rejected' ? [{ key: 'rejectReason', label: 'Reason' } as Column<Property>] : []),
  ];

  return (
    <>
      <PageHeader title="Approvals" />
      <Card>
        <Tabs<Tab> tabs={[{ id: 'pending', label: 'Pending' }, { id: 'rejected', label: 'Rejected' }, { id: 'approved', label: 'Approved' }]} active={tab} onChange={setTab} />
        <DataTable columns={columns} rows={rows.filter(p => p.approval === tab)} exportName={`approvals-${tab}`}
          actions={canEdit ? p => (
            <>
              {p.approval !== 'approved' && <Button size="sm" variant="success" onClick={() => approve(p)}>Approve</Button>}{' '}
              {p.approval !== 'rejected' && <Button size="sm" variant="danger" onClick={() => setRejecting(p)}>Reject</Button>}
            </>
          ) : undefined} />
      </Card>
      {rejecting && (
        <FormModal title={`Reject ${rejecting.name}`} submitLabel="Reject" fields={[{ name: 'reason', label: 'Reason', type: 'textarea', required: true }]}
          onSubmit={async v => { await api.post(`/properties/${rejecting.id}/reject`, { reason: v.reason }); toast('Property rejected'); load(); }}
          onClose={() => setRejecting(null)} />
      )}
    </>
  );
}
