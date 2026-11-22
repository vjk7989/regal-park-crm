import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Button, ConfirmDialog, Empty, PageHeader, StatusBadge, Tabs, useToast } from '../../components/ui';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import { formatShort } from '../../../shared/format';
import type { EntityDef } from '../../../shared/registry';
import { canM, cleanValues, editValues, errMsg, toColumns, toFormFields, useRefs, valueText, type Rec } from '../../moduleUtil';

export default function ModuleTable({ moduleKey, entity, embedded }: { moduleKey: string; entity: EntityDef; embedded?: boolean }) {
  const { can } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Rec[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [modal, setModal] = useState<{ row?: Rec } | null>(null);
  const [del, setDel] = useState<Rec | null>(null);
  const [show, setShow] = useState<Rec | null>(null);
  const entities = useMemo(() => [entity], [entity]);
  const refs = useRefs(entities);

  const load = useCallback(async () => {
    try { setRows(await api.get<Rec[]>(`/x/${entity.key}`)); } catch (e) { setRows([]); toast(errMsg(e), 'error'); }
    setLoaded(true);
  }, [entity.key, toast]);
  useEffect(() => { setLoaded(false); setFilters({}); setView('table'); void load(); }, [entity.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const canCreate = canM(can, moduleKey, 'create');
  const canEdit = canM(can, moduleKey, 'edit');
  const canDelete = canM(can, moduleKey, 'delete');

  const filterFields = useMemo(() => {
    const sel = entity.fields.filter(f => f.type === 'select' && f.options?.length);
    sel.sort((a, b) => Number(b.key === entity.statusField) - Number(a.key === entity.statusField));
    return sel.slice(0, 3);
  }, [entity]);
  const filtered = rows.filter(r => filterFields.every(f => !filters[f.key] || r[f.key] === filters[f.key]));
  const columns = useMemo(() => toColumns(entity, refs), [entity, refs]);
  const fields = useMemo(() => toFormFields(entity, refs), [entity, refs]);

  const submit = async (values: Record<string, any>) => {
    const body = modal?.row ? editValues(values) : cleanValues(values);
    try {
      if (modal?.row) await api.put(`/x/${entity.key}/${modal.row.id}`, body); else await api.post(`/x/${entity.key}`, body);
      toast(modal?.row ? `${entity.singular} updated` : `${entity.singular} created`);
      await load();
    } catch (e) { toast(errMsg(e), 'error'); throw e; }
  };
  const remove = async () => {
    if (!del) return;
    try { await api.del(`/x/${entity.key}/${del.id}`); toast(`${entity.singular} deleted`); await load(); } catch (e) { toast(errMsg(e), 'error'); }
    setDel(null);
  };
  const setStatus = async (r: Rec, status: string) => {
    try { await api.put(`/x/${entity.key}/${r.id}`, { [entity.statusField!]: status }); toast('Status updated'); await load(); } catch (e) { toast(errMsg(e), 'error'); }
  };

  const actions = (r: Rec) => (
    <>
      <Button size="sm" variant="ghost" onClick={() => setShow(r)}>View</Button>{' '}
      {canEdit && <Button size="sm" variant="ghost" onClick={() => setModal({ row: r })}>Edit</Button>}{' '}
      {canDelete && <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button>}
    </>
  );

  const sf = entity.statusField ? entity.fields.find(f => f.key === entity.statusField) : undefined;
  const amount = entity.amountField ? entity.fields.find(f => f.key === entity.amountField) : undefined;
  const title = (r: Rec) => String(r[entity.titleField] ?? r.code ?? r.id);

  return (
    <>
      {!embedded && <PageHeader title={entity.label} subtitle={`${rows.length} records`}
        actions={canCreate && <Button onClick={() => setModal({})}>Add {entity.singular}</Button>} />}
      {embedded && canCreate && <div className="page-actions" style={{ marginBottom: 10 }}><Button size="sm" onClick={() => setModal({})}>Add {entity.singular}</Button></div>}
      {filterFields.length > 0 && (
        <div className="filters">
          {filterFields.map(f => (
            <select key={f.key} aria-label={f.label} value={filters[f.key] ?? ''} onChange={e => setFilters(s => ({ ...s, [f.key]: e.target.value }))}>
              <option value="">All {f.label}</option>
              {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
        </div>
      )}
      {entity.kanban && sf?.options && <Tabs tabs={[{ id: 'table', label: 'Table' }, { id: 'kanban', label: 'Kanban' }]} active={view} onChange={setView} />}
      {view === 'table' || !sf?.options ? (
        <DataTable columns={columns} rows={filtered} actions={actions} exportName={entity.key}
          emptyMessage={loaded ? `No ${entity.label.toLowerCase()} found.` : 'Loading...'} />
      ) : (
        <div className="kanban">
          {sf.options.map(st => {
            const col = filtered.filter(r => r[sf.key] === st);
            const total = amount ? col.reduce((s, r) => s + Number(r[amount.key] ?? 0), 0) : 0;
            return (
              <div key={st} className="kanban-col">
                <div className="kanban-head"><StatusBadge status={st} /> <strong>{col.length}</strong>{amount && <> <span className="muted">{formatShort(total)}</span></>}</div>
                {col.length === 0 && <Empty message="Empty" />}
                {col.map(r => (
                  <div key={r.id} className="kanban-card card">
                    <strong>{title(r)}</strong>
                    {entity.fields.filter(f => f.key !== entity.titleField && f.key !== sf.key && f.list !== false).slice(0, 3).map(f => (
                      <div key={f.key} className="muted">{f.label}: {valueText(f, r[f.key], refs)}</div>
                    ))}
                    {canEdit && (
                      <select aria-label={`Status for ${title(r)}`} value={r[sf.key] ?? ''} onChange={e => void setStatus(r, e.target.value)}>
                        {sf.options!.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    <div>{actions(r)}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {modal && (
        <FormModal title={modal.row ? `Edit ${entity.singular}` : `Add ${entity.singular}`} fields={fields} initial={modal.row ?? {}}
          onSubmit={submit} onClose={() => setModal(null)} />
      )}
      {show && (
        <div className="modal-backdrop" onClick={() => setShow(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>{entity.singular}: {title(show)}</h3><button type="button" className="icon-btn" aria-label="Close" onClick={() => setShow(null)}>×</button></div>
            <div className="modal-body">
              <dl className="kv">
                {entity.prefix && <div><dt>Code</dt><dd>{show.code ?? '—'}</dd></div>}
                {entity.fields.map(f => <div key={f.key}><dt>{f.label}</dt><dd>{valueText(f, show[f.key], refs)}</dd></div>)}
              </dl>
            </div>
            <div className="modal-foot"><Button variant="ghost" onClick={() => setShow(null)}>Close</Button></div>
          </div>
        </div>
      )}
      <ConfirmDialog open={!!del} danger title={`Delete ${entity.singular}`} message={`Delete "${del ? title(del) : ''}"? This cannot be undone.`}
        confirmLabel="Delete" onConfirm={remove} onCancel={() => setDel(null)} />
    </>
  );
}
