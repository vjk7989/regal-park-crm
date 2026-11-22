import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button, Card, ConfirmDialog, PageHeader, StatusBadge, Tabs, useToast } from '../components/ui';
import DataTable, { Column } from '../components/DataTable';
import FormModal, { Field, FormValues } from '../components/FormModal';
import { formatINR } from '../../shared/format';
import { MODULES, ROLES, ROLE_LABELS } from '../../shared/types';
import type { Action, Module, PermissionMatrix, Plan, Role, Settings as SettingsT, User } from '../../shared/types';

type Tab = 'general' | 'prefixes' | 'plans' | 'users' | 'permissions' | 'data';
const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' }, { id: 'prefixes', label: 'Prefixes' }, { id: 'plans', label: 'Plans' },
  { id: 'users', label: 'Users' }, { id: 'permissions', label: 'Permissions' }, { id: 'data', label: 'Data' },
];
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Request failed');

export default function Settings() {
  const [tab, setTab] = useState<Tab>('general');
  const [settings, setSettings] = useState<SettingsT | null>(null);
  const toast = useToast();
  useEffect(() => { api.get<SettingsT>('/settings').then(setSettings).catch(e => toast(msg(e), 'error')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader title="Settings" subtitle="Branding, numbering, plans, users and access" />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'general' && settings && <General settings={settings} onSaved={setSettings} />}
      {tab === 'prefixes' && settings && <Prefixes settings={settings} onSaved={setSettings} />}
      {tab === 'plans' && <Plans />}
      {tab === 'users' && <Users />}
      {tab === 'permissions' && <Permissions />}
      {tab === 'data' && <Data />}
    </>
  );
}

function General({ settings, onSaved }: { settings: SettingsT; onSaved: (s: SettingsT) => void }) {
  const toast = useToast();
  const [v, setV] = useState<SettingsT>(settings);
  const text: [keyof SettingsT, string][] = [['companyName', 'Company name'], ['productName', 'Product name'], ['projectName', 'Project name'], ['tagline', 'Tagline'],
    ['rera', 'RERA number'], ['phone', 'Phone'], ['email', 'Email'], ['address', 'Address']];
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { prefixes, nextNumbers, currency, ...rest } = v;
      onSaved(await api.put<SettingsT>('/settings', rest));
      toast('Settings saved');
    } catch (err) { toast(msg(err), 'error'); }
  };
  return (
    <Card title="General">
      <form onSubmit={save}>
        <div className="form-grid">
          {text.map(([k, label]) => (
            <div key={k} className="form-field">
              <label htmlFor={`g-${k}`}>{label}</label>
              <input id={`g-${k}`} value={String(v[k] ?? '')} onChange={e => setV({ ...v, [k]: e.target.value })} />
            </div>
          ))}
          <div className="form-field check">
            <label htmlFor="g-broker">Show broker portal</label>
            <input id="g-broker" type="checkbox" checked={!!v.showBrokerPortal} onChange={e => setV({ ...v, showBrokerPortal: e.target.checked })} />
          </div>
          <div className="form-field check">
            <label htmlFor="g-approval">Require property approval</label>
            <input id="g-approval" type="checkbox" checked={!!v.requirePropertyApproval} onChange={e => setV({ ...v, requirePropertyApproval: e.target.checked })} />
          </div>
        </div>
        <Button type="submit">Save changes</Button>
      </form>
    </Card>
  );
}

function Prefixes({ settings, onSaved }: { settings: SettingsT; onSaved: (s: SettingsT) => void }) {
  const toast = useToast();
  const [prefixes, setPrefixes] = useState(settings.prefixes);
  const [next, setNext] = useState<Record<string, string | number>>(settings.nextNumbers);
  const keys = Object.keys(settings.prefixes) as (keyof SettingsT['prefixes'])[];
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const nextNumbers = Object.fromEntries(keys.map(k => [k, Number(next[k])]));
      onSaved(await api.put<SettingsT>('/settings', { prefixes, nextNumbers }));
      toast('Prefixes saved');
    } catch (err) { toast(msg(err), 'error'); }
  };
  return (
    <Card title="Number prefixes">
      <form onSubmit={save}>
        <table className="table">
          <thead><tr><th>Record</th><th>Prefix</th><th>Next number</th></tr></thead>
          <tbody>
            {keys.map(k => (
              <tr key={k}>
                <td style={{ textTransform: 'capitalize' }}>{k}</td>
                <td><input aria-label={`${k} prefix`} value={prefixes[k]} onChange={e => setPrefixes({ ...prefixes, [k]: e.target.value })} /></td>
                <td><input aria-label={`${k} next number`} type="number" min={1} value={next[k]} onChange={e => setNext({ ...next, [k]: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button type="submit">Save prefixes</Button>
      </form>
    </Card>
  );
}

function Plans() {
  const { can } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Plan[]>([]);
  const [modal, setModal] = useState<Plan | 'new' | null>(null);
  const [del, setDel] = useState<Plan | null>(null);
  const load = useCallback(() => { api.get<Plan[]>('/plans').then(setRows).catch(e => toast(msg(e), 'error')); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  const fields: Field[] = [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'monthlyListings', label: 'Monthly listings', type: 'number', min: 0 },
    { name: 'rate', label: 'Rate (INR)', type: 'number', min: 0 },
    { name: 'paymentType', label: 'Payment type', type: 'select', options: [{ value: 'Monthly', label: 'Monthly' }, { value: 'Yearly', label: 'Yearly' }] },
    { name: 'description', label: 'Description', type: 'textarea' },
  ];
  const cols: Column<Plan>[] = [
    { key: 'name', label: 'Name' }, { key: 'monthlyListings', label: 'Listings / month' },
    { key: 'rate', label: 'Rate', render: p => formatINR(p.rate), sortValue: p => p.rate }, { key: 'paymentType', label: 'Payment type' }, { key: 'description', label: 'Description' },
  ];
  const submit = async (vals: FormValues) => {
    if (modal && modal !== 'new') await api.put(`/plans/${modal.id}`, vals); else await api.post('/plans', vals);
    toast('Plan saved'); load();
  };
  return (
    <Card title="Plans" actions={can('settings', 'create') && <Button size="sm" onClick={() => setModal('new')}>Add plan</Button>}>
      <DataTable columns={cols} rows={rows} exportName="plans" actions={p => (
        <>
          {can('settings', 'edit') && <Button size="sm" variant="ghost" onClick={() => setModal(p)}>Edit</Button>}
          {can('settings', 'delete') && <Button size="sm" variant="danger" onClick={() => setDel(p)}>Delete</Button>}
        </>
      )} />
      {modal && <FormModal title={modal === 'new' ? 'Add plan' : 'Edit plan'} fields={fields} initial={modal === 'new' ? { paymentType: 'Monthly' } : modal} onSubmit={submit} onClose={() => setModal(null)} />}
      <ConfirmDialog open={!!del} danger title="Delete plan" confirmLabel="Delete" message={`Delete plan "${del?.name}"?`} onCancel={() => setDel(null)}
        onConfirm={async () => {
          try { await api.del(`/plans/${del!.id}`); toast('Plan deleted'); load(); } catch (e) { toast(msg(e), 'error'); }
          setDel(null);
        }} />
    </Card>
  );
}

const LINK_COLLECTION: Record<Role, string | null> = { admin: null, staff: 'staff', agent: 'agents', broker: 'brokers', owner: 'owners', client: 'clients' };
type PUser = Omit<User, 'password'>;
type Named = { id: string; name: string };

function Users() {
  const { can } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<PUser[]>([]);
  const [linked, setLinked] = useState<Record<string, Named[]>>({});
  const [modal, setModal] = useState<PUser | 'new' | null>(null);
  const [role, setRole] = useState<Role>('staff');
  const [del, setDel] = useState<PUser | null>(null);

  const load = useCallback(() => { api.get<PUser[]>('/users').then(setRows).catch(e => toast(msg(e), 'error')); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  useEffect(() => {
    for (const col of Object.values(LINK_COLLECTION)) {
      if (col) api.get<Named[]>(`/${col}`).then(r => setLinked(l => ({ ...l, [col]: r }))).catch(() => undefined);
    }
  }, []);

  const linkName = (u: PUser) => {
    const col = LINK_COLLECTION[u.role];
    return (col && linked[col]?.find(r => r.id === u.linkedId)?.name) || '—';
  };
  const openModal = (u: PUser | 'new') => { setRole(u === 'new' ? 'staff' : u.role); setModal(u); };
  const col = LINK_COLLECTION[role];
  const fields: Field[] = [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'role', label: 'Role', type: 'select', required: true, options: ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] })) },
    { name: 'password', label: modal === 'new' ? 'Password' : 'Password (blank = keep)', type: 'text', required: modal === 'new' },
    { name: 'linkedId', label: 'Linked record', type: 'select', options: (col ? linked[col] ?? [] : []).map(r => ({ value: r.id, label: r.name })) },
    { name: 'active', label: 'Active', type: 'checkbox' },
  ];
  const cols: Column<PUser>[] = [
    { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role', render: u => ROLE_LABELS[u.role], sortValue: u => ROLE_LABELS[u.role] },
    { key: 'linkedId', label: 'Linked record', render: linkName, sortValue: linkName },
    { key: 'active', label: 'Active', render: u => <StatusBadge status={u.active ? 'Active' : 'Inactive'} />, sortValue: u => (u.active ? 'Active' : 'Inactive') },
  ];
  const submit = async (vals: FormValues) => {
    const body: FormValues = { ...vals };
    if (!body.password) delete body.password;
    const lc = LINK_COLLECTION[body.role as Role];
    if (!lc) body.linkedId = '';
    else if (linked[lc] && !linked[lc].some(r => r.id === body.linkedId)) body.linkedId = '';
    if (modal && modal !== 'new') await api.put(`/users/${modal.id}`, body); else await api.post('/users', body);
    toast('User saved'); load();
  };
  return (
    <Card title="Users" actions={can('settings', 'create') && <Button size="sm" onClick={() => openModal('new')}>Add user</Button>}>
      <DataTable columns={cols} rows={rows} exportName="users" actions={u => (
        <>
          {can('settings', 'edit') && <Button size="sm" variant="ghost" onClick={() => openModal(u)}>Edit</Button>}
          {can('settings', 'delete') && <Button size="sm" variant="danger" onClick={() => setDel(u)}>Delete</Button>}
        </>
      )} />
      {modal && (
        <RoleAwareModal key={modal === 'new' ? 'new' : modal.id} title={modal === 'new' ? 'Add user' : 'Edit user'} fields={fields}
          initial={modal === 'new' ? { role, active: true } : { ...modal, role, password: '' }} onRole={setRole} onSubmit={submit} onClose={() => setModal(null)} />
      )}
      <ConfirmDialog open={!!del} danger title="Delete user" confirmLabel="Delete" message={`Delete user "${del?.name}"?`} onCancel={() => setDel(null)}
        onConfirm={async () => {
          try { await api.del(`/users/${del!.id}`); toast('User deleted'); load(); } catch (e) { toast(msg(e), 'error'); }
          setDel(null);
        }} />
    </Card>
  );
}

/** FormModal has no change hook; watch the role select via event delegation so the linked-record list follows the role. */
function RoleAwareModal({ onRole, ...props }: React.ComponentProps<typeof FormModal> & { onRole: (r: Role) => void }) {
  return (
    <div onChange={e => { const t = e.target as HTMLSelectElement; if (t.id === 'f-role') onRole(t.value as Role); }}>
      <FormModal {...props} />
    </div>
  );
}

const ACTIONS: { a: Action; l: string }[] = [{ a: 'view', l: 'V' }, { a: 'create', l: 'C' }, { a: 'edit', l: 'E' }, { a: 'delete', l: 'D' }];

function Permissions() {
  const { can } = useAuth();
  const toast = useToast();
  const [m, setM] = useState<PermissionMatrix | null>(null);
  useEffect(() => { api.get<PermissionMatrix>('/permissions').then(setM).catch(e => toast(msg(e), 'error')); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return <Card>Loading...</Card>;
  const editable = can('settings', 'edit');
  const toggle = (r: Role, mod: Module, a: Action, on: boolean) => {
    const cur = m[r][mod] ?? [];
    setM({ ...m, [r]: { ...m[r], [mod]: on ? [...cur.filter(x => x !== a), a] : cur.filter(x => x !== a) } });
  };
  const save = async () => {
    try { setM(await api.put<PermissionMatrix>('/permissions', m)); toast('Permissions saved'); } catch (e) { toast(msg(e), 'error'); }
  };
  return (
    <Card title="Permissions (V = view, C = create, E = edit, D = delete)" actions={editable && <Button size="sm" onClick={save}>Save permissions</Button>}>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr><th rowSpan={2}>Module</th>{ROLES.map(r => <th key={r} colSpan={4} style={{ textAlign: 'center' }}>{ROLE_LABELS[r]}</th>)}</tr>
            <tr>{ROLES.map(r => ACTIONS.map(x => <th key={r + x.a} style={{ textAlign: 'center' }}>{x.l}</th>))}</tr>
          </thead>
          <tbody>
            {MODULES.map(mod => (
              <tr key={mod}>
                <td>{mod}</td>
                {ROLES.map(r => ACTIONS.map(x => {
                  const locked = r === 'admin' && mod === 'settings';
                  return (
                    <td key={r + x.a} style={{ textAlign: 'center' }}>
                      <input type="checkbox" aria-label={`${r} ${mod} ${x.a}`} disabled={locked || !editable}
                        checked={locked || (m[r][mod] ?? []).includes(x.a)} onChange={e => toggle(r, mod, x.a, e.target.checked)} />
                    </td>
                  );
                }))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Data() {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const reset = async () => {
    try {
      await api.post('/admin/reset');
      toast('Demo data reset');
      setTimeout(() => location.reload(), 600);
    } catch (e) { toast(msg(e), 'error'); }
    setOpen(false);
  };
  return (
    <Card title="Data">
      <p>Restore all records, settings and permissions to the original demo data. This cannot be undone.</p>
      {user?.role === 'admin' && <Button variant="danger" onClick={() => setOpen(true)}>Reset demo data</Button>}
      <ConfirmDialog open={open} danger title="Reset demo data" confirmLabel="Reset" message="All changes will be lost and the demo data restored. Continue?" onCancel={() => setOpen(false)} onConfirm={reset} />
    </Card>
  );
}
