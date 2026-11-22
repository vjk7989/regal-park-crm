// Deterministic mock-data generator for registry modules (PLAN §10.3). Browser-safe: no Node imports.
import type { DB } from './types';
import type { EntityDef, FieldDef, Gen, ModuleDef } from './registry';

const FIRST = ['Aarav', 'Vihaan', 'Arjun', 'Rohan', 'Karthik', 'Suresh', 'Ramesh', 'Anil', 'Vikram', 'Sandeep', 'Manoj', 'Prakash', 'Naveen', 'Harish', 'Girish', 'Deepak', 'Rajesh', 'Mahesh', 'Srinivas', 'Venkat',
  'Ananya', 'Priya', 'Divya', 'Kavya', 'Meera', 'Lakshmi', 'Pooja', 'Sneha', 'Swathi', 'Shruti', 'Nandini', 'Revathi', 'Anitha', 'Sunitha', 'Bhavana', 'Deepika', 'Rashmi', 'Aishwarya', 'Padma', 'Vidya',
  'Mohan', 'Gopal', 'Ravi', 'Sathish', 'Kiran', 'Pradeep', 'Ashok', 'Nagaraj', 'Basavaraj', 'Chandan'];
const LAST = ['Reddy', 'Rao', 'Sharma', 'Iyer', 'Nair', 'Gowda', 'Hegde', 'Shetty', 'Patel', 'Kumar', 'Menon', 'Naidu', 'Pillai', 'Joshi', 'Kulkarni', 'Bhat', 'Agarwal', 'Gupta', 'Singh', 'Desai',
  'Murthy', 'Prasad', 'Shenoy', 'Acharya', 'Kamath', 'Rangan', 'Subramanian', 'Krishnan', 'Raman', 'Verma', 'Mishra', 'Banerjee', 'Chatterjee', 'Jain', 'Mehta', 'Pai', 'Naik', 'Gowda', 'Swamy', 'Babu'];
const COMPANIES = ['Shree Balaji Cement Traders', 'Prestige Interiors LLP', 'Sri Venkateshwara Steel Corp', 'Namma Bengaluru Hardware', 'Lakshmi Electricals', 'Kaveri Tiles & Sanitaryware', 'Orchid Infra Services',
  'Sai Ganesh Constructions', 'Maruthi Plywood House', 'Bharat Paints & Coatings', 'Southern Aggregates Pvt Ltd', 'Hosur Road Transport Co', 'Silicon City Facility Services', 'Annapurna Catering Services',
  'GreenLeaf Landscaping', 'Metro Scaffolding Rentals', 'Ganga Readymix Concrete', 'Vijaya Timber Mart', 'Surya Solar Solutions', 'Mysore Granite Works', 'Deccan Surveyors & Engineers', 'Trident Legal Associates',
  'Anand Brokerage Services', 'Skyline Marketing Agency', 'Pragathi Print Solutions', 'Techno Edge IT Services', 'Kumar & Sons Plumbing', 'Raghavendra Electricals', 'Whitefield Glass & Aluminium', 'Sapthagiri Security Services'];
const LOCALITIES = ['Electronic City', 'HSR Layout', 'Koramangala', 'Whitefield', 'Sarjapur Road', 'Hebbal', 'JP Nagar', 'Bannerghatta Road', 'Hosur Road', 'Marathahalli', 'Indiranagar', 'Jayanagar', 'Yelahanka', 'Bellandur', 'Devanahalli', 'KR Puram', 'Basavanagudi', 'Rajajinagar', 'Banashankari', 'BTM Layout'];
const CITIES = ['Bengaluru', 'Bengaluru', 'Bengaluru', 'Bengaluru', 'Mysuru', 'Hosur', 'Chennai', 'Hyderabad'];
const VEHICLES = ['Tata Ace', 'Mahindra Bolero Pickup', 'JCB 3DX', 'Ashok Leyland Tipper', 'Tata 407', 'Eicher Pro 2049', 'Mahindra Scorpio', 'Toyota Innova Crysta', 'Maruti Ertiga', 'Hyundai Creta', 'Tata Prima Mixer', 'Bobcat S450'];
const MATERIALS = ['UltraTech 53 Grade Cement', 'JSW Neosteel TMT 12mm', 'Kajaria Vitrified Tiles', 'Jaquar CP Fittings', 'Asian Paints Apex', 'Birla Gold Cement', 'Tata Tiscon TMT 16mm', 'Finolex PVC Pipes', 'Havells FR Wires', 'River Sand (M-Sand)',
  'Century Plywood 19mm', 'Berger Weathercoat', 'Cera Sanitaryware', 'Ramco Hi-Strength AAC Blocks', 'Polycab Cables', 'Saint-Gobain Glass 10mm'];
const PRODUCTS = ['Premium Villa Plot', '2BHK Apartment', '3BHK Apartment', 'Modular Kitchen Set', 'Home Automation Kit', 'Interior Design Package', 'Parking Slot', 'Club Membership', 'Solar Water Heater', 'Vastu Consultation'];
const SENT = ['Site inspection completed at the Electronic City project and the structural work is on schedule.', 'Customer requested a revised payment schedule linked to the slab completion milestone.',
  'Possession handover is planned after the final plumbing and electrical snag list is cleared.', 'Please share the approved BBMP plan copy and the latest RERA registration certificate.',
  'Material delivery was delayed due to heavy rain on Hosur Road; the vendor promised dispatch by tomorrow.', 'Buyer is interested in a corner villa with a north-east facing entrance and garden space.',
  'Loan sanction from the bank is awaited before the registration appointment at the sub-registrar office.', 'Quality team flagged minor seepage in the basement waterproofing which needs rework.',
  'Brochure and price sheet for the Sarjapur Road launch were shared over WhatsApp.', 'Carpet area and super built-up area details were verified against the sale agreement.',
  'The contractor has requested an advance for the next phase of block work and plastering.', 'Follow-up call scheduled after the weekend site visit with the family.',
  'Khata transfer and EC documents are pending verification by the legal team.', 'Vendor invoice has been matched with the purchase order and sent for approval.'];
const WORDS = ['Villa', 'Tower', 'Phase', 'Block', 'Clubhouse', 'Plot', 'Layout', 'Residency', 'Heights', 'Enclave', 'Gardens', 'Pavilion', 'Basement', 'Terrace', 'Podium', 'Handover', 'Booking', 'Snag', 'Site', 'Review'];
const ADJ = ['Premium', 'Urgent', 'Annual', 'Quarterly', 'Final', 'Revised', 'Interim', 'Primary', 'Standard', 'Special', 'Monthly', 'Weekly'];
const DOMAINS = ['gmail.com', 'regalpark.in', 'outlook.com', 'yahoo.co.in'];

type Rec = Record<string, any>;
const CORE_REFS = ['clients', 'users', 'properties', 'staff', 'agents', 'brokers', 'owners', 'leads'];

const DAY = 86400000;
const ms = (d: string) => Date.parse(d + 'T00:00:00Z');
const dstr = (t: number) => new Date(t).toISOString().slice(0, 10);
const slug = (s: string, sep = '.') => s.toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^\\${sep}|\\${sep}$`, 'g'), '');

export function generateRegistryData(registry: ModuleDef[], core: DB, rand: () => number, today: string) {
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  // skewed pick: early options more common, later ones rarer (realistic status mix)
  const skew = <T,>(arr: T[]): T => arr[Math.min(arr.length - 1, Math.floor(Math.pow(rand(), 1.5) * arr.length))];
  const day = (off: number) => dstr(ms(today) + off * DAY);
  const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join('');
  const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + int(0, 25))).join('');
  const person = () => `${pick(FIRST)} ${pick(LAST)}`;
  const round = (v: number, lo: number, hi: number) => {
    const step = v >= 500000 ? 5000 : v >= 100000 ? 1000 : v >= 10000 ? 500 : v >= 1000 ? 50 : 1;
    return Math.min(hi, Math.max(lo, Math.round(v / step) * step));
  };

  const users = core.users.filter(u => u.role === 'admin' || u.role === 'staff');
  const x: Record<string, Rec[]> = {};
  const xNext: Record<string, number> = {};
  const moduleSettings: Record<string, Record<string, any>> = {};
  const coreIds = (name: string): string[] => ((core as any)[name] ?? []).map((r: Rec) => r.id);

  const phone = () => `+91 ${pick(['9', '9', '8', '7', '6'])}${digits(4)} ${digits(5)}`;
  const genValue = (g: Gen, key: string, ctx: { name?: string }): string => {
    switch (g) {
      case 'person': return person();
      case 'company': return pick(COMPANIES);
      case 'phone': return phone();
      case 'email': {
        const n = ctx.name ?? person();
        const company = COMPANIES.includes(n);
        return `${slug(n)}${company ? '' : int(0, 3) === 0 ? int(1, 99) : ''}@${company ? slug(n, '').slice(0, 18) + '.in' : pick(DOMAINS)}`;
      }
      case 'address': return `${int(1, 450)}, ${pick(['1st', '2nd', '3rd', '4th', '5th'])} Cross, ${pick(LOCALITIES)}, ${pick(CITIES)} ${pick(['560', '560', '562'])}${digits(3)}`;
      case 'locality': return pick(LOCALITIES);
      case 'city': return pick(CITIES);
      case 'sentence': return pick(SENT);
      case 'paragraph': return `${pick(SENT)} ${pick(SENT)} ${pick(SENT)}`;
      case 'past': return day(-int(1, 180));
      case 'future': return day(int(1, 180));
      case 'recent': return day(-int(0, 30));
      case 'vehicle': return pick(VEHICLES);
      case 'plate': return `KA-${pad2(int(1, 59))}-${letters(2)}-${digits(4)}`;
      case 'material': return pick(MATERIALS);
      case 'product': return pick(PRODUCTS);
      case 'serial': return `SN-${letters(2)}${digits(6)}`;
      case 'hash': return Array.from({ length: 16 }, () => int(0, 15).toString(16)).join('');
    }
  };
  const pad2 = (n: number) => String(n).padStart(2, '0');

  const refIds = (f: FieldDef): string[] | undefined => {
    if (!f.ref) return undefined;
    return CORE_REFS.includes(f.ref) ? coreIds(f.ref) : (x[f.ref] ?? []).map(r => r.id);
  };

  const numeric = (f: FieldDef): number => {
    const lo = f.min ?? (f.type === 'money' || f.type === 'number' ? 1000 : 0);
    const hi = f.max ?? 500000;
    const v = lo + rand() * (hi - lo);
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) return Math.min(hi, Math.max(lo, +v.toFixed(2)));
    if (f.type === 'number' && hi - lo < 100) return Math.round(v);
    return round(v, lo, hi);
  };

  const fieldValue = (f: FieldDef, ent: EntityDef, ctx: { name?: string }): any => {
    if (f.type === 'ref') { const ids = refIds(f); return ids && ids.length ? pick(ids) : undefined; }
    if (f.pool?.length) return f.type === 'multiselect' ? multi(f.pool) : coerce(f, f.key === ent.statusField ? skew(f.pool) : pick(f.pool));
    if (f.options?.length) {
      if (f.type === 'multiselect') return multi(f.options);
      return f.key === ent.statusField ? skew(f.options) : pick(f.options);
    }
    if (f.gen) {
      const v = genValue(f.gen, f.key, ctx);
      if (f.gen === 'person' || f.gen === 'company') ctx.name = v;
      return v;
    }
    switch (f.type) {
      case 'money': case 'number': return numeric(f);
      case 'percent': return numeric({ ...f, min: f.min ?? 0, max: f.max ?? 100 });
      case 'checkbox': return rand() < 0.7;
      case 'multiselect': return [];
      case 'select': return undefined;
      case 'email': return genValue('email', f.key, ctx);
      case 'tel': return phone();
      case 'url': return `https://www.${slug(ctx.name ?? pick(COMPANIES), '')}.in`;
      case 'date': return day(/due|expiry|end|deadline|renew|valid|next|until/i.test(f.key) ? int(1, 180) : -int(0, 180));
      case 'datetime': { const d = day(-int(0, 120)); return `${d}T${pad2(int(8, 19))}:${pad2(int(0, 3) * 15)}:00.000Z`; }
      case 'textarea': return `${pick(SENT)} ${pick(SENT)}`;
      case 'text': default: return f.key === ent.titleField || int(0, 1) ? `${pick(ADJ)} ${pick(WORDS)} ${pick(WORDS)}` : `${pick(ADJ)} ${pick(WORDS)}`;
    }
  };
  const coerce = (f: FieldDef, v: string): any =>
    f.type === 'number' || f.type === 'money' || f.type === 'percent' ? Number(v) : f.type === 'checkbox' ? v === 'true' : v;
  const multi = (opts: string[]) => {
    const n = Math.min(opts.length, int(1, 3));
    const pool = [...opts]; const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(pool.splice(int(0, pool.length - 1), 1)[0]);
    return out;
  };

  const entities = registry.flatMap(m => m.entities);
  const ordered = [...entities.filter(e => e.lookup), ...entities.filter(e => !e.lookup)];
  for (const ent of ordered) {
    const count = ent.seedCount ?? 12;
    const list: Rec[] = [];
    for (let n = 1; n <= count; n++) {
      const rec: Rec = {
        id: `${ent.key}-${n}`,
        createdAt: `${day(-int(0, 180))}T${pad2(int(8, 19))}:${pad2(int(0, 59))}:00.000Z`,
        createdBy: users.length ? pick(users).id : undefined,
      };
      if (ent.prefix) rec.code = `${ent.prefix}${String(n).padStart(4, '0')}`;
      const ctx: { name?: string } = {};
      for (const f of ent.fields) {
        const v = fieldValue(f, ent, ctx);
        if (v !== undefined) rec[f.key] = v;
      }
      list.push(rec);
    }
    x[ent.key] = list;
    xNext[ent.key] = count + 1;
  }
  // keep registry order in output for stable, readable JSON
  const xOut: Record<string, Rec[]> = {}; const nextOut: Record<string, number> = {};
  for (const e of entities) { xOut[e.key] = x[e.key]; nextOut[e.key] = xNext[e.key]; }

  for (const m of registry) {
    if (!m.settings?.length) continue;
    const s: Record<string, any> = {};
    for (const f of m.settings) {
      const first = f.pool?.[0] ?? f.options?.[0];
      if (first !== undefined) s[f.key] = f.type === 'multiselect' ? [first] : coerce(f, first);
      else if (f.type === 'checkbox') s[f.key] = true;
      else if (f.type === 'money' || f.type === 'number' || f.type === 'percent') s[f.key] = f.min ?? 0;
      else s[f.key] = '';
    }
    moduleSettings[m.key] = s;
  }
  return { x: xOut, xNext: nextOut, moduleSettings };
}
