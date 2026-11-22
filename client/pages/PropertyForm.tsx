import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Button, Card, PageHeader, Tabs, useToast } from '../components/ui';
import type { Property } from '../../shared/types';

export const STYLES = ['Villa', 'Apartment', 'Plot', 'Duplex', 'Penthouse', 'Commercial', 'Office', 'Row House'];
export const AMENITIES = ['Clubhouse', 'Tennis Court', 'Basketball Court', 'Skating Rink', 'Yoga Deck', 'Kids Play Area', 'Jungle Gym', 'Aroma Garden', 'Multipurpose Lawn',
  '10 Landscaped Parks', 'EV Charging', '24x7 Security', 'Swimming Pool', 'Gym', 'Power Backup', 'Lift', 'Covered Parking', 'Rainwater Harvesting'];
const LISTING = ['Housing', 'Business', 'Agriculture', 'Government'];
const STATUSES = ['Pending', 'New', 'Active', 'Pending Sale', 'Closed Sale', 'Sold', 'Rented', 'Temp off Market', 'Withdrawn', 'Cancelled', 'Backup', 'Expired'];
const FACING = ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'];
const FURNISHED = ['Unfurnished', 'Semi-Furnished', 'Fully Furnished'];
const CONDITION = ['Completed', 'Under Construction', 'Pre Construction', 'Under Renovation'];

type Form = Record<string, any>;
type Tab = 'property' | 'address' | 'amenities' | 'rooms' | 'expenses' | 'assignment';
interface Person { id: string; name: string; code?: string }

const EMPTY: Form = {
  name: '', project: '', listingType: 'Housing', style: 'Villa', status: 'Active', transactionType: 'Sale', price: '', rentalPrice: '', rentalType: '',
  reservationAmount: '', maintenanceFee: '', beds: 0, baths: 0, areaSqft: 0, plotSqft: '', floors: '', facing: '', furnished: 'Unfurnished', condition: 'Completed',
  newConstruction: false, yearBuilt: '', possessionDate: '', listingPrivacy: 'public', description: '', address: '', city: '', state: 'Karnataka', zip: '', lat: '', lng: '',
  amenities: [], rooms: [], expenses: [], ownerId: '', agentId: '', brokerId: '',
};
const NUMERIC = ['price', 'rentalPrice', 'reservationAmount', 'maintenanceFee', 'beds', 'baths', 'areaSqft', 'plotSqft', 'floors', 'yearBuilt', 'lat', 'lng'];

export default function PropertyForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('property');
  const [v, setV] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [lists, setLists] = useState<Record<'owners' | 'agents' | 'brokers', Person[] | null>>({ owners: null, agents: null, brokers: null });

  useEffect(() => {
    if (id) api.get<Property>(`/properties/${id}`).then(p => setV({ ...EMPTY, ...Object.fromEntries(Object.entries(p).map(([k, x]) => [k, x ?? EMPTY[k] ?? ''])) })).catch(e => toast(e.message, 'error'));
  }, [id, toast]);
  useEffect(() => {
    for (const k of ['owners', 'agents', 'brokers'] as const) {
      api.get<Person[]>(`/${k}`).then(r => setLists(s => ({ ...s, [k]: r }))).catch(() => undefined);
    }
  }, []);

  const set = (k: string, x: any) => setV(s => ({ ...s, [k]: x }));
  const text = (k: string, label: string, type = 'text', extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="form-field" key={k}>
      <label htmlFor={`p-${k}`}>{label}</label>
      <input id={`p-${k}`} type={type} value={v[k] ?? ''} onChange={e => set(k, e.target.value)} {...extra} />
      {errors[k] && <span className="field-error">{errors[k]}</span>}
    </div>
  );
  const sel = (k: string, label: string, opts: string[], blank = false) => (
    <div className="form-field" key={k}>
      <label htmlFor={`p-${k}`}>{label}</label>
      <select id={`p-${k}`} value={v[k] ?? ''} onChange={e => set(k, e.target.value)}>
        {blank && <option value="">-</option>}
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
      {errors[k] && <span className="field-error">{errors[k]}</span>}
    </div>
  );

  const rowEdit = (key: 'rooms' | 'expenses', i: number, patch: Form) => set(key, v[key].map((r: Form, j: number) => (j === i ? { ...r, ...patch } : r)));
  const rowDel = (key: 'rooms' | 'expenses', i: number) => set(key, v[key].filter((_: Form, j: number) => j !== i));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!String(v.name).trim()) errs.name = 'Name is required';
    if (!v.transactionType) errs.transactionType = 'Transaction type is required';
    if (v.price === '' || Number(v.price) < 0) errs.price = 'Price must be 0 or more';
    setErrors(errs);
    if (Object.keys(errs).length) { setTab('property'); return; }
    const body: Form = { ...v, rooms: v.rooms.map((r: Form) => ({ ...r, widthFt: Number(r.widthFt) || 0, lengthFt: Number(r.lengthFt) || 0 })),
      expenses: v.expenses.map((x: Form) => ({ ...x, amount: Number(x.amount) || 0 })) };
    for (const k of NUMERIC) if (body[k] !== '') body[k] = Number(body[k]);
    for (const k of ['ownerId', 'agentId', 'brokerId']) if (body[k] === '') delete body[k];
    setBusy(true);
    try {
      const saved = id ? await api.put<Property>(`/properties/${id}`, body) : await api.post<Property>('/properties', body);
      toast(id ? 'Property updated' : 'Property created');
      nav(`/properties/${saved?.id ?? id}`);
    } catch (err) {
      const er = err as Error & { field?: string };
      if (er.field) { setErrors({ [er.field]: er.message }); setTab('property'); }
      toast(er.message, 'error');
    } finally { setBusy(false); }
  };

  const person = (k: 'owners' | 'agents' | 'brokers', fk: string, label: string) => lists[k] && (
    <div className="form-field" key={k}>
      <label htmlFor={`p-${fk}`}>{label}</label>
      <select id={`p-${fk}`} value={v[fk] ?? ''} onChange={e => set(fk, e.target.value)}>
        <option value="">-</option>
        {lists[k]!.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
      </select>
    </div>
  );

  return (
    <>
      <PageHeader title={id ? 'Edit Property' : 'New Property'} />
      <Card>
        <form onSubmit={save} noValidate>
          <Tabs<Tab> active={tab} onChange={setTab} tabs={[{ id: 'property', label: 'Property' }, { id: 'address', label: 'Address' }, { id: 'amenities', label: 'Amenities' },
            { id: 'rooms', label: 'Rooms' }, { id: 'expenses', label: 'Expenses' }, { id: 'assignment', label: 'Assignment' }]} />
          {tab === 'property' && (
            <div className="form-grid">
              {text('name', 'Name *')}
              {text('project', 'Project')}
              {sel('listingType', 'Listing type', LISTING)}
              {sel('style', 'Style', STYLES)}
              {sel('status', 'Status', STATUSES)}
              {sel('transactionType', 'Transaction type *', ['Sale', 'Rent'])}
              {text('price', 'Price *', 'number', { min: 0 })}
              {text('rentalPrice', 'Rental price', 'number', { min: 0 })}
              {sel('rentalType', 'Rental type', ['Month(s)', 'Year(s)'], true)}
              {text('reservationAmount', 'Reservation amount', 'number', { min: 0 })}
              {text('maintenanceFee', 'Maintenance fee', 'number', { min: 0 })}
              {text('beds', 'Beds', 'number', { min: 0 })}
              {text('baths', 'Baths', 'number', { min: 0 })}
              {text('areaSqft', 'Area (sqft)', 'number', { min: 0 })}
              {text('plotSqft', 'Plot (sqft)', 'number', { min: 0 })}
              {text('floors', 'Floors', 'number', { min: 0 })}
              {sel('facing', 'Facing', FACING, true)}
              {sel('furnished', 'Furnished', FURNISHED)}
              {sel('condition', 'Condition', CONDITION)}
              <div className="form-field check">
                <label htmlFor="p-newConstruction">New construction</label>
                <input id="p-newConstruction" type="checkbox" checked={!!v.newConstruction} onChange={e => set('newConstruction', e.target.checked)} />
              </div>
              {text('yearBuilt', 'Year built', 'number')}
              {text('possessionDate', 'Possession date', 'date')}
              {sel('listingPrivacy', 'Listing privacy', ['public', 'internal'])}
              <div className="form-field full">
                <label htmlFor="p-description">Description</label>
                <textarea id="p-description" rows={4} value={v.description ?? ''} onChange={e => set('description', e.target.value)} />
              </div>
            </div>
          )}
          {tab === 'address' && (
            <div className="form-grid">
              {text('address', 'Address')}{text('city', 'City')}{text('state', 'State')}{text('zip', 'ZIP')}
              {text('lat', 'Latitude', 'number', { step: 'any' })}{text('lng', 'Longitude', 'number', { step: 'any' })}
            </div>
          )}
          {tab === 'amenities' && (
            <div className="chip-group">
              {Array.from(new Set([...AMENITIES, ...v.amenities])).map(a => {
                const on = v.amenities.includes(a);
                return <button type="button" key={a} className={`chip ${on ? 'on' : ''}`} onClick={() => set('amenities', on ? v.amenities.filter((x: string) => x !== a) : [...v.amenities, a])}>{a}</button>;
              })}
            </div>
          )}
          {tab === 'rooms' && (
            <div>
              {v.rooms.map((r: Form, i: number) => (
                <div className="form-grid" key={i} style={{ marginBottom: 8 }}>
                  <input aria-label="Room type" placeholder="Type" value={r.type} onChange={e => rowEdit('rooms', i, { type: e.target.value })} />
                  <input aria-label="Level" placeholder="Level" value={r.level} onChange={e => rowEdit('rooms', i, { level: e.target.value })} />
                  <input aria-label="Width (ft)" type="number" min={0} placeholder="Width ft" value={r.widthFt} onChange={e => rowEdit('rooms', i, { widthFt: e.target.value })} />
                  <input aria-label="Length (ft)" type="number" min={0} placeholder="Length ft" value={r.lengthFt} onChange={e => rowEdit('rooms', i, { lengthFt: e.target.value })} />
                  <Button type="button" size="sm" variant="danger" onClick={() => rowDel('rooms', i)}>Remove</Button>
                </div>
              ))}
              <Button type="button" variant="ghost" onClick={() => set('rooms', [...v.rooms, { type: '', level: 'Ground', widthFt: 10, lengthFt: 10 }])}>Add room</Button>
            </div>
          )}
          {tab === 'expenses' && (
            <div>
              {v.expenses.map((x: Form, i: number) => (
                <div className="form-grid" key={i} style={{ marginBottom: 8 }}>
                  <input aria-label="Label" placeholder="Label" value={x.label} onChange={e => rowEdit('expenses', i, { label: e.target.value })} />
                  <input aria-label="Amount" type="number" min={0} placeholder="Amount" value={x.amount} onChange={e => rowEdit('expenses', i, { amount: e.target.value })} />
                  <Button type="button" size="sm" variant="danger" onClick={() => rowDel('expenses', i)}>Remove</Button>
                </div>
              ))}
              <Button type="button" variant="ghost" onClick={() => set('expenses', [...v.expenses, { label: '', amount: 0 }])}>Add expense</Button>
            </div>
          )}
          {tab === 'assignment' && (
            <div className="form-grid">
              {person('owners', 'ownerId', 'Owner')}
              {person('agents', 'agentId', 'Agent')}
              {person('brokers', 'brokerId', 'Broker')}
              {!lists.owners && !lists.agents && !lists.brokers && <p className="muted">Assignment is managed automatically for your account.</p>}
            </div>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button>
            <Button type="button" variant="ghost" onClick={() => nav(id ? `/properties/${id}` : '/properties')}>Cancel</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
