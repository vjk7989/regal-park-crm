import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Button, Card, PageHeader, Tabs, useToast } from '../../components/ui';
import type { ModuleDef } from '../../../shared/registry';
import { canM, errMsg, toFormFields, useRefs } from '../../moduleUtil';
import ModuleTable from './ModuleTable';

function SettingsForm({ module }: { module: ModuleDef }) {
  const { can } = useAuth();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, any> | null>(null);
  const defs = module.settings ?? [];
  const pseudo = useMemo(() => ({ key: `${module.key}_settings`, label: 'Settings', singular: 'Settings', titleField: defs[0]?.key ?? '', fields: defs }), [module]); // eslint-disable-line react-hooks/exhaustive-deps
  const refs = useRefs(useMemo(() => [pseudo], [pseudo]));
  const fields = toFormFields(pseudo, refs);
  const editable = canM(can, module.key, 'edit');
  useEffect(() => {
    setValues(null);
    api.get<Record<string, any>>(`/m/${module.key}/settings`).then(setValues).catch(e => { setValues({}); toast(errMsg(e), 'error'); });
  }, [module.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!values) return <Card>Loading...</Card>;
  if (defs.length === 0) return <Card title="Settings">This module has no settings.</Card>;
  const set = (k: string, v: any) => setValues(s => ({ ...s, [k]: v }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, any> = { ...values };
    for (const f of fields) if (f.type === 'number' && body[f.name] !== '' && body[f.name] != null) body[f.name] = Number(body[f.name]);
    try { setValues(await api.put(`/m/${module.key}/settings`, body)); toast('Settings saved'); } catch (er) { toast(errMsg(er), 'error'); }
  };
  return (
    <Card title="Module settings">
      <form onSubmit={save}>
        <div className="form-grid">
          {fields.map(f => {
            const v = values[f.name];
            const id = `s-${f.name}`;
            return (
              <div key={f.name} className={`form-field ${f.type === 'checkbox' ? 'check' : ''}`}>
                <label htmlFor={id}>{f.label}</label>
                {f.type === 'checkbox' ? <input id={id} type="checkbox" disabled={!editable} checked={!!v} onChange={e => set(f.name, e.target.checked)} />
                  : f.type === 'select' ? (
                    <select id={id} disabled={!editable} value={v ?? ''} onChange={e => set(f.name, e.target.value)}>
                      <option value="">Select...</option>
                      {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === 'multiselect' ? (
                    <div className="chip-group">
                      {f.options?.map(o => {
                        const arr: string[] = Array.isArray(v) ? v : [];
                        const on = arr.includes(o.value);
                        return <button type="button" key={o.value} disabled={!editable} className={`chip ${on ? 'on' : ''}`} onClick={() => set(f.name, on ? arr.filter(x => x !== o.value) : [...arr, o.value])}>{o.label}</button>;
                      })}
                    </div>
                  ) : f.type === 'textarea' ? <textarea id={id} rows={3} disabled={!editable} value={v ?? ''} onChange={e => set(f.name, e.target.value)} />
                    : <input id={id} type={f.type} disabled={!editable} min={f.min} step={f.step} value={v ?? ''} onChange={e => set(f.name, e.target.value)} />}
              </div>
            );
          })}
        </div>
        {editable && <div style={{ marginTop: 12 }}><Button type="submit">Save settings</Button></div>}
      </form>
    </Card>
  );
}

export default function ModuleSettings({ module, title }: { module: ModuleDef; title: string }) {
  const lookups = module.entities.filter(e => e.lookup);
  const hasSettings = (module.settings?.length ?? 0) > 0;
  const tabs = [...(hasSettings || lookups.length === 0 ? [{ id: '_settings', label: 'Settings' }] : []), ...lookups.map(e => ({ id: e.key, label: e.label }))];
  const [tab, setTab] = useState(tabs[0].id);
  useEffect(() => { setTab(tabs[0].id); }, [module.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ent = lookups.find(e => e.key === tab);
  return (
    <>
      <PageHeader title={title} subtitle={module.label} />
      {tabs.length > 1 && <Tabs tabs={tabs} active={tab} onChange={setTab} />}
      {ent ? <ModuleTable key={ent.key} moduleKey={module.key} entity={ent} embedded /> : <SettingsForm module={module} />}
    </>
  );
}
