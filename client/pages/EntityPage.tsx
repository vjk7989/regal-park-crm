import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Button, ConfirmDialog, PageHeader, useToast } from '../components/ui';
import DataTable, { Column } from '../components/DataTable';
import FormModal, { Field, FormValues } from '../components/FormModal';
import { isIndianMobile } from '../../shared/format';
import type { Plan } from '../../shared/types';
import { ENTITIES, EntityKey } from './entities';

type Row = Record<string, any> & { id: string };

export default function EntityPage({ entity }: { entity: EntityKey }) {
  const cfg = ENTITIES[entity];
  const { can } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [propCounts, setPropCounts] = useState<Record<string, number> | null>(null);
  const [modal, setModal] = useState<{ row?: Row } | null>(null);
  const [del, setDel] = useState<Row | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<Row[]>(`/${entity}`));
    } catch (e) {
      setRows([]);
      toast((e as Error).message, 'error');
    }
  }, [entity, toast]);

  useEffect(() => {
    void load();
    setPlans([]);
    setPropCounts(null);
    if (cfg.fields.some(x => x.plans)) api.get<Plan[]>('/plans').then(setPlans).catch(() => undefined);
    if (entity === 'owners' && can('properties', 'view')) {
      api.get<{ ownerId?: string }[]>('/properties').then(ps => {
        const m: Record<string, number> = {};
        for (const p of ps) if (p.ownerId) m[p.ownerId] = (m[p.ownerId] ?? 0) + 1;
        setPropCounts(m);
      }).catch(() => setPropCounts(null));
    }
  }, [entity]); // eslint-disable-line react-hooks/exhaustive-deps

  const planName = useCallback((id?: string) => plans.find(p => p.id === id)?.name ?? '—', [plans]);
  const canEdit = can(cfg.module, 'edit');

  const toggle = async (row: Row, key: string) => {
    try {
      await api.put(`/${entity}/${row.id}`, { [key]: !row[key] });
      toast(`${row.name}: ${key} ${row[key] ? 'off' : 'on'}`);
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const columns: Column<Row>[] = useMemo(() => {
    const cols: Column<Row>[] = cfg.columns.map(key => {
      const fd = cfg.fields.find(x => x.name === key)!;
      if (fd.type === 'checkbox') {
        return {
          key, label: fd.label, sortValue: (r: Row) => (r[key] ? 1 : 0),
          render: (r: Row) => (key === 'active' || key === 'verified') && canEdit
            ? <input type="checkbox" aria-label={`${fd.label} ${r.name}`} checked={!!r[key]} onChange={() => void toggle(r, key)} />
            : <Badge color={r[key] ? 'green' : 'grey'}>{r[key] ? 'Yes' : 'No'}</Badge>,
        };
      }
      if (key === 'planId') return { key, label: fd.label, sortValue: (r: Row) => planName(r.planId), render: (r: Row) => planName(r.planId) };
      if (key === 'lastLogin') return { key, label: fd.label, sortValue: (r: Row) => r.lastLogin ?? '', render: (r: Row) => (r.lastLogin ? new Date(r.lastLogin).toLocaleString('en-IN') : '—') };
      return { key, label: fd.label, sortValue: (r: Row) => r[key] ?? '', render: (r: Row) => r[key] || '—' };
    });
    if (propCounts) cols.push({ key: 'properties', label: 'Properties', sortValue: (r: Row) => propCounts[r.id] ?? 0, render: (r: Row) => propCounts[r.id] ?? 0 });
    return cols;
  }, [cfg, planName, propCounts, canEdit, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const formFields: Field[] = cfg.fields.filter(x => !x.readOnly).map(x => ({
    name: x.name, label: x.label, type: x.type, required: x.required,
    options: x.plans ? plans.map(p => ({ value: p.id, label: p.name })) : x.options?.map(o => ({ value: o, label: o })),
  }));

  const submit = async (v: FormValues) => {
    const email = String(v.email ?? '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address');
    const phone = String(v.phone ?? '').trim();
    if (phone && !isIndianMobile(phone)) throw new Error('Enter a valid 10-digit Indian mobile number');
    const editing = modal?.row;
    if (editing) await api.put(`/${entity}/${editing.id}`, v);
    else await api.post(`/${entity}`, v);
    toast(`${cfg.singular} ${editing ? 'updated' : 'added'}`);
    await load();
  };

  const confirmDelete = async () => {
    if (!del) return;
    try {
      await api.del(`/${entity}/${del.id}`);
      toast(`${cfg.singular} deleted`);
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setDel(null);
  };

  const initialNew: FormValues = entity === 'clients' ? { type: 'Buyer' } : { active: true };

  return (
    <>
      <PageHeader title={cfg.title} subtitle={`${rows.length} records`}
        actions={can(cfg.module, 'create') && <Button onClick={() => setModal({})}>Add {cfg.singular}</Button>} />
      <DataTable columns={columns} rows={rows} exportName={entity}
        actions={(r: Row) => (
          <>
            {canEdit && <Button size="sm" variant="ghost" onClick={() => setModal({ row: r })}>Edit</Button>}{' '}
            {can(cfg.module, 'delete') && <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button>}
          </>
        )} />
      {modal && (
        <FormModal title={modal.row ? `Edit ${cfg.singular}` : `Add ${cfg.singular}`} fields={formFields}
          initial={modal.row ?? initialNew} onSubmit={submit} onClose={() => setModal(null)} />
      )}
      <ConfirmDialog open={!!del} danger confirmLabel="Delete" title={`Delete ${cfg.singular}`}
        message={`Delete ${del?.name ?? ''}? This cannot be undone.`} onConfirm={confirmDelete} onCancel={() => setDel(null)} />
    </>
  );
}
