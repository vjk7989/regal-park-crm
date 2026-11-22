import fs from 'node:fs';
import path from 'node:path';
import type {
  Agent, Broker, Client, Contract, DB, Invoice, Lead, LeadStatus, Owner, Payment, Plan, Property, PropertyRequest,
  PropertyStatus, RequestStatus, Staff, Tenant, User,
} from '../shared/types';
import { DEFAULT_PERMISSIONS } from '../shared/permissions';
import { REGISTRY } from '../shared/registry';
import { generateRegistryData } from '../shared/seedgen';

// ---------- deterministic helpers ----------
let state = 20261122;
function rnd(): number {
  state = (state + 0x6d2b79f5) | 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const jitter = (c: number, r: number) => +(c + (rnd() * 2 - 1) * r).toFixed(5);
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, i) => s + i[1], 0);
  let r = rnd() * total;
  for (const [v, w] of items) { if ((r -= w) < 0) return v; }
  return items[items.length - 1][0];
}

const TODAY = '2026-11-22';
const DAY = 86400000;
const ms = (d: string) => Date.parse(d + 'T00:00:00Z');
const dstr = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => dstr(ms(d) + n * DAY);
function addMonths(d: string, n: number): string {
  const dt = new Date(ms(d));
  dt.setUTCMonth(dt.getUTCMonth() + n);
  return dt.toISOString().slice(0, 10);
}
const ago = (n: number) => addDays(TODAY, -n);
const ts = (d: string, h = 10, m = 0) => `${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
const pad = (n: number, w = 4) => String(n).padStart(w, '0');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

const FIRST = ['Aarav', 'Vihaan', 'Arjun', 'Rohan', 'Karthik', 'Suresh', 'Ramesh', 'Anil', 'Vikram', 'Sandeep', 'Manoj', 'Prakash', 'Naveen', 'Harish', 'Girish', 'Deepak', 'Rajesh', 'Mahesh', 'Srinivas', 'Venkat',
  'Ananya', 'Priya', 'Divya', 'Lakshmi', 'Kavitha', 'Meera', 'Sneha', 'Pooja', 'Neha', 'Swathi', 'Anjali', 'Shruti', 'Revathi', 'Deepa', 'Nandini', 'Sowmya', 'Aishwarya', 'Radhika', 'Harini', 'Bhavana'];
const LAST = ['Reddy', 'Rao', 'Sharma', 'Iyer', 'Nair', 'Gowda', 'Hegde', 'Shetty', 'Patel', 'Kumar', 'Menon', 'Naidu', 'Pillai', 'Joshi', 'Kulkarni', 'Bhat', 'Agarwal', 'Gupta', 'Singh', 'Desai',
  'Krishnan', 'Raman', 'Subramanian', 'Chandra', 'Murthy', 'Prasad', 'Varma', 'Mehta', 'Kapoor', 'Banerjee'];
const usedNames = new Set<string>();
function person(): string {
  for (;;) {
    const n = `${pick(FIRST)} ${pick(LAST)}`;
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
}
function phone(): string {
  let s = String(int(6, 9));
  for (let i = 0; i < 9; i++) s += int(0, 9);
  return `+91 ${s.slice(0, 5)} ${s.slice(5)}`;
}
const emailOf = (name: string, domain: string) => `${slug(name)}@${domain}`;

// ---------- settings / plans ----------
const prefixes = { property: 'SRP-', owner: 'PO-', agent: 'AG-', broker: 'BB-', staff: 'ST-', client: 'CL-', buy: 'BR-', rent: 'RR-', invoice: 'INV-', contract: 'CON-', tenant: 'TN-' };
const plans: Plan[] = [
  { id: 'plan-1', createdAt: ts(ago(300)), name: 'Silver', monthlyListings: 10, rate: 4999, paymentType: 'Monthly', description: 'Up to 10 listings per month' },
  { id: 'plan-2', createdAt: ts(ago(300)), name: 'Gold', monthlyListings: 30, rate: 11999, paymentType: 'Monthly', description: 'Up to 30 listings per month' },
  { id: 'plan-3', createdAt: ts(ago(300)), name: 'Platinum', monthlyListings: 999, rate: 119999, paymentType: 'Yearly', description: 'Unlimited listings' },
];

// ---------- staff ----------
const staffDesig = ['Sales Head', 'Sales Manager', 'Sales Manager', 'CRM Executive', 'CRM Executive', 'Site Engineer', 'Accounts', 'Legal'];
const staff: Staff[] = staffDesig.map((designation, i) => {
  const name = person();
  return {
    id: `stf-${pad(i + 1, 2)}`, createdAt: ts(ago(320 - i * 3)), code: `ST-${pad(i + 1)}`, name,
    email: i === 0 ? 'sales@regalpark.demo' : emailOf(name, 'sterlitee.in'), phone: phone(), designation,
    approvalManager: i < 2, requireApproval: i >= 3, isPublic: i < 5, active: true, lastLogin: ts(ago(int(0, 6)), int(9, 18), int(0, 59)),
  };
});

// ---------- agents / brokers ----------
const agencyNames = ['Urban Nest Realty', 'Silicon Valley Homes', 'Garden City Properties', 'Namma Bengaluru Estates', 'Lakeview Realtors', 'EC Prime Properties'];
const agentCities = ['Bengaluru', 'Bengaluru', 'Bengaluru', 'Bengaluru', 'Bengaluru', 'Bengaluru'];
const agents: Agent[] = agencyNames.map((name, i) => ({
  id: `agt-${pad(i + 1, 2)}`, createdAt: ts(ago(280 - i * 5)), code: `AG-${pad(i + 1)}`, name,
  email: i === 0 ? 'agent@regalpark.demo' : `contact@${slug(name).replace(/\./g, '')}.in`, phone: phone(), city: agentCities[i],
  reraAgentNo: `PRM/KA/RERA/1251/310/AG/${pad(100 + i * 17 + int(0, 9), 6)}`, planId: plans[i % 3].id, verified: i !== 4, isPublic: i !== 5, active: i !== 5,
}));
const brokerNames = ['Anand Channel Partners', 'Skyline Business Brokers', 'Orchid Realty Partners', 'Metro Deal Makers', 'Trident Property Advisors'];
const brokers: Broker[] = brokerNames.map((name, i) => ({
  id: `brk-${pad(i + 1, 2)}`, createdAt: ts(ago(260 - i * 6)), code: `BB-${pad(i + 1)}`, name,
  email: i === 0 ? 'broker@regalpark.demo' : `hello@${slug(name).replace(/\./g, '')}.in`, phone: phone(), city: pick(['Bengaluru', 'Bengaluru', 'Mysuru', 'Hosur']),
  reraAgentNo: `PRM/KA/RERA/1251/310/AG/${pad(300 + i * 23 + int(0, 9), 6)}`, planId: plans[(i + 1) % 3].id, active: true,
}));

// ---------- owners ----------
const ownerCities: [string, string][] = [['Bengaluru', 'Karnataka'], ['Bengaluru', 'Karnataka'], ['Bengaluru', 'Karnataka'], ['Bengaluru', 'Karnataka'], ['Mysuru', 'Karnataka'], ['Hyderabad', 'Telangana'], ['Chennai', 'Tamil Nadu'], ['Bengaluru', 'Karnataka'], ['Pune', 'Maharashtra'], ['Bengaluru', 'Karnataka'], ['Coimbatore', 'Tamil Nadu']];
const owners: Owner[] = [{
  id: 'own-01', createdAt: ts(ago(330)), code: 'PO-0001', name: 'Sterlitee Developers', email: 'info@sterlitee.in', phone: '+91 90080 32626', city: 'Bengaluru', state: 'Karnataka',
  address: 'Sterlitee Regal Park, Neotown, Electronic City Phase 1, Bengaluru 560100', pan: 'AABCS4821K', active: true,
}];
for (let i = 0; i < 11; i++) {
  const name = person();
  const letters = 'ABCDEFGHJKLMNPRSTUVW';
  owners.push({
    id: `own-${pad(i + 2, 2)}`, createdAt: ts(ago(300 - i * 7)), code: `PO-${pad(i + 2)}`, name, email: i === 0 ? 'owner@regalpark.demo' : emailOf(name, 'example.in'), phone: phone(),
    city: ownerCities[i][0], state: ownerCities[i][1], address: `${int(11, 480)}, ${pick(['3rd Cross', '5th Main', '12th Cross', '1st Block', '80 Feet Road'])}, ${ownerCities[i][0]}`,
    pan: `${'A'}${letters[int(0, 19)]}${letters[int(0, 19)]}P${name[0].toUpperCase()}${pad(int(1000, 9999))}${letters[int(0, 19)]}`, active: i !== 9,
  });
}

// ---------- clients ----------
const clientCities = ['Bengaluru', 'Bengaluru', 'Bengaluru', 'Bengaluru', 'Bengaluru', 'Bengaluru', 'Hyderabad', 'Hyderabad', 'Chennai', 'Chennai', 'Dubai', 'Dubai'];
const clients: Client[] = [];
for (let i = 0; i < 30; i++) {
  const name = person();
  const type: Client['type'] = i === 0 ? 'Buyer' : i <= 8 ? 'Tenant' : i <= 21 ? 'Buyer' : 'Investor';
  const city = i === 0 ? 'Bengaluru' : pick(clientCities);
  clients.push({
    id: `cli-${pad(i + 1, 2)}`, createdAt: ts(ago(200 - i * 4)), code: `CL-${pad(i + 1)}`, name, email: i === 0 ? 'client@regalpark.demo' : emailOf(name, 'example.com'), phone: phone(), city, type,
    company: type === 'Investor' || (i % 7 === 3) ? pick(['Infosys', 'Wipro', 'Accenture', 'Bosch', 'Self-employed', 'TCS', 'Emirates NBD', 'Amazon']) : undefined,
  });
}

// ---------- properties ----------
const AMEN_VILLA = ['Clubhouse', 'Tennis Court', 'Basketball Court', 'Skating Rink', 'Yoga Deck', 'Kids Play Area', 'Jungle Gym', 'Aroma Garden', 'Multipurpose Lawn', '10 Landscaped Parks', 'EV Charging', '24x7 Security'];
const AMEN_APT = ['Lift', 'Covered Parking', 'Power Backup', '24x7 Security', 'Gym', 'Swimming Pool', 'Clubhouse', 'Kids Play Area', 'Intercom', 'Rainwater Harvesting', 'Visitor Parking'];
const FACINGS = ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'] as const;
function subset(arr: string[], min: number, max: number, must: string[] = []): string[] {
  const rest = arr.filter(a => !must.includes(a));
  const n = int(min, max) - must.length;
  const out = [...must];
  const pool = [...rest];
  while (out.length < Math.max(n + must.length, must.length) && pool.length) out.push(pool.splice(int(0, pool.length - 1), 1)[0]);
  return arr.filter(a => out.includes(a));
}
function mkRooms(beds: number): Property['rooms'] {
  const all: Property['rooms'] = [
    { type: 'Living Room', level: 'Ground', widthFt: int(14, 20), lengthFt: int(18, 26) },
    { type: 'Kitchen', level: 'Ground', widthFt: int(10, 14), lengthFt: int(12, 16) },
    { type: 'Master Bedroom', level: 'First', widthFt: int(13, 17), lengthFt: int(14, 18) },
    { type: 'Bedroom 2', level: 'First', widthFt: int(11, 14), lengthFt: int(12, 15) },
  ];
  return all.slice(0, Math.min(4, Math.max(2, beds >= 3 ? 4 : 3)));
}
function mkExpenses(price: number, rent: boolean): Property['expenses'] {
  const all = rent
    ? [{ label: 'Maintenance', amount: roundTo(price * 0.08, 100) }, { label: 'BBMP khata fee', amount: 4500 }, { label: 'Property tax', amount: roundTo(price * 0.15, 100) }]
    : [{ label: 'Property tax', amount: roundTo(price * 0.0008, 100) }, { label: 'BBMP khata', amount: 25000 }, { label: 'Maintenance', amount: roundTo(price * 0.0003, 100) }];
  return all.slice(0, int(1, 3));
}
const properties: Property[] = [];
let pcode = 0;
function addProp(p: Omit<Property, 'id' | 'code' | 'createdAt' | 'state' | 'rooms' | 'expenses' | 'listingPrivacy'> & Partial<Pick<Property, 'listingPrivacy' | 'rooms' | 'expenses'>>): Property {
  pcode++;
  const full: Property = {
    state: 'Karnataka', listingPrivacy: 'public', rooms: mkRooms(p.beds), expenses: mkExpenses(p.price, p.transactionType === 'Rent'),
    ...p, id: `prp-${pad(pcode, 3)}`, code: `SRP-${pad(pcode)}`, createdAt: ts(ago(int(60, 300)), int(9, 17), int(0, 59)),
  };
  properties.push(full);
  return full;
}

type Cfg = { name: string; beds: number; plot: [number, number]; plotSqft: number; built: number; price: [number, number] };
const CFGS: Cfg[] = [
  { name: 'Riora', beds: 4, plot: [30, 50], plotSqft: 1500, built: 3200, price: [43000000, 45500000] },
  { name: 'Avira', beds: 4, plot: [35, 50], plotSqft: 1750, built: 3650, price: [49000000, 52000000] },
  { name: 'Selora', beds: 4, plot: [35, 55], plotSqft: 1925, built: 3950, price: [54000000, 58000000] },
  { name: 'Elora', beds: 5, plot: [40, 50], plotSqft: 2000, built: 4400, price: [61000000, 66000000] },
];
const villaStatus: Record<number, PropertyStatus> = { 0: 'Sold', 8: 'Sold', 15: 'Sold', 3: 'Closed Sale', 17: 'Closed Sale', 1: 'Pending Sale', 9: 'Pending Sale', 16: 'Pending Sale', 22: 'Pending Sale', 25: 'Pending Sale', 5: 'Backup', 12: 'Backup' };
const villaCount = CFGS.length * 7;
const brokerCycle = [1, 2, 3, 4];
for (let i = 0; i < villaCount; i++) {
  const cfg = CFGS[Math.floor(i / 7)];
  const n = (i % 7) + 1;
  const price = roundTo(cfg.price[0] + rnd() * (cfg.price[1] - cfg.price[0]), 100000);
  const agentId = i < 8 ? agents[0].id : i < 13 ? undefined : i % 2 === 0 ? agents[1 + (i % 5)].id : undefined;
  const brokerId = i >= 8 && i < 13 ? brokers[0].id : i >= 13 && i % 2 === 1 ? brokers[brokerCycle[i % 4]].id : undefined;
  addProp({
    name: `${cfg.name} Villa ${cfg.name[0]}-${pad(n, 2)}`, project: 'Sterlitee Regal Park', listingType: 'Housing', style: 'Villa', status: villaStatus[i] ?? 'Active', transactionType: 'Sale',
    price, reservationAmount: 500000, maintenanceFee: 4500 + cfg.beds * 500, beds: cfg.beds, baths: cfg.beds + 1, areaSqft: cfg.built + int(-60, 60), plotSqft: cfg.plotSqft, floors: 3,
    facing: FACINGS[int(0, 7)], furnished: 'Unfurnished', condition: i % 3 === 0 ? 'Pre Construction' : 'Under Construction', newConstruction: true, possessionDate: '2028-12-31',
    address: 'Sterlitee Regal Park, Neotown, Electronic City Phase 1', city: 'Bengaluru', zip: '560100', lat: jitter(12.8196, 0.0014), lng: jitter(77.6588, 0.0014),
    amenities: subset(AMEN_VILLA, 8, 12, ['Clubhouse', '24x7 Security']), ownerId: owners[0].id, agentId, brokerId, approval: 'approved',
    description: `${cfg.beds}BHK premium villa on a ${cfg.plot[0]}x${cfg.plot[1]} plot (${cfg.plotSqft} sq ft) in Sterlitee Regal Park. Your Private World, Nestled in Electronic City.`,
  });
}

const LOCS: Record<string, { zip: string; lat: number; lng: number }> = {
  'Electronic City': { zip: '560100', lat: 12.8456, lng: 77.6603 }, 'HSR Layout': { zip: '560102', lat: 12.9116, lng: 77.6389 },
  'Sarjapur Road': { zip: '560035', lat: 12.9101, lng: 77.687 }, Whitefield: { zip: '560066', lat: 12.9698, lng: 77.75 },
  Koramangala: { zip: '560034', lat: 12.9352, lng: 77.6245 }, 'Bannerghatta Road': { zip: '560076', lat: 12.8913, lng: 77.597 }, Hebbal: { zip: '560024', lat: 13.0358, lng: 77.597 },
};
interface Other { name: string; loc: string; style: Property['style']; beds: number; area: number; price: number; tx: 'Sale' | 'Rent'; furn: Property['furnished']; owner: number; approval?: Property['approval']; status?: PropertyStatus; priv?: 'internal' }
const OTHERS: Other[] = [
  // rentals R0..R10
  { name: 'Koramangala 3BHK Apartment', loc: 'Koramangala', style: 'Apartment', beds: 3, area: 1650, price: 95000, tx: 'Rent', furn: 'Semi-Furnished', owner: 3, status: 'Rented' },
  { name: 'HSR Layout 2BHK Apartment', loc: 'HSR Layout', style: 'Apartment', beds: 2, area: 1250, price: 48000, tx: 'Rent', furn: 'Semi-Furnished', owner: 1, status: 'Rented' },
  { name: 'Whitefield 3BHK Apartment', loc: 'Whitefield', style: 'Apartment', beds: 3, area: 1800, price: 62000, tx: 'Rent', furn: 'Fully Furnished', owner: 1, status: 'Rented' },
  { name: 'Electronic City 2BHK Apartment', loc: 'Electronic City', style: 'Apartment', beds: 2, area: 1100, price: 28000, tx: 'Rent', furn: 'Unfurnished', owner: 1, status: 'Rented' },
  { name: 'Sarjapur Road 3BHK Row House', loc: 'Sarjapur Road', style: 'Row House', beds: 3, area: 2100, price: 78000, tx: 'Rent', furn: 'Semi-Furnished', owner: 1, status: 'Rented' },
  { name: 'Hebbal 4BHK Penthouse', loc: 'Hebbal', style: 'Penthouse', beds: 4, area: 3400, price: 250000, tx: 'Rent', furn: 'Fully Furnished', owner: 4, status: 'Rented', priv: 'internal' },
  { name: 'Bannerghatta Road 2BHK Apartment', loc: 'Bannerghatta Road', style: 'Apartment', beds: 2, area: 1180, price: 32000, tx: 'Rent', furn: 'Semi-Furnished', owner: 5, status: 'Rented' },
  { name: 'Koramangala Office Space', loc: 'Koramangala', style: 'Office', beds: 0, area: 1400, price: 120000, tx: 'Rent', furn: 'Fully Furnished', owner: 6, status: 'Rented' },
  { name: 'Whitefield Commercial Shop', loc: 'Whitefield', style: 'Commercial', beds: 0, area: 900, price: 85000, tx: 'Rent', furn: 'Unfurnished', owner: 7, status: 'Active' },
  { name: 'HSR Layout 3BHK Duplex', loc: 'HSR Layout', style: 'Duplex', beds: 3, area: 2200, price: 110000, tx: 'Rent', furn: 'Semi-Furnished', owner: 8, status: 'Active' },
  { name: 'Electronic City 2BHK Flat', loc: 'Electronic City', style: 'Apartment', beds: 2, area: 1050, price: 30000, tx: 'Rent', furn: 'Unfurnished', owner: 9, approval: 'pending', status: 'Pending' },
  // resale S0..S4
  { name: 'Sarjapur Road 3BHK Apartment', loc: 'Sarjapur Road', style: 'Apartment', beds: 3, area: 1720, price: 14500000, tx: 'Sale', furn: 'Semi-Furnished', owner: 9, approval: 'pending', status: 'Pending' },
  { name: 'Whitefield 4BHK Row House', loc: 'Whitefield', style: 'Row House', beds: 4, area: 2900, price: 32000000, tx: 'Sale', furn: 'Unfurnished', owner: 10, approval: 'pending', status: 'Pending' },
  { name: 'Hebbal 3BHK Apartment', loc: 'Hebbal', style: 'Apartment', beds: 3, area: 1650, price: 18500000, tx: 'Sale', furn: 'Semi-Furnished', owner: 11, approval: 'pending', status: 'Pending' },
  { name: 'Koramangala 4BHK Duplex', loc: 'Koramangala', style: 'Duplex', beds: 4, area: 3100, price: 41000000, tx: 'Sale', furn: 'Fully Furnished', owner: 2, approval: 'rejected', status: 'Pending' },
  { name: 'Electronic City Office Floor', loc: 'Electronic City', style: 'Office', beds: 0, area: 2400, price: 22000000, tx: 'Sale', furn: 'Unfurnished', owner: 10, status: 'Active' },
];
const others: Property[] = OTHERS.map((o, i) => {
  const loc = LOCS[o.loc];
  const rent = o.tx === 'Rent';
  const biz = o.style === 'Office' || o.style === 'Commercial';
  return addProp({
    name: o.name, listingType: biz ? 'Business' : 'Housing', style: o.style, status: o.status ?? 'Active', transactionType: o.tx, price: o.price,
    rentalPrice: rent ? o.price : undefined, rentalType: rent ? 'Month(s)' : undefined, maintenanceFee: rent ? undefined : 3000 + o.beds * 800,
    beds: o.beds, baths: Math.max(1, o.beds > 0 ? o.beds - (o.beds > 2 ? 0 : 1) + 1 : 2), areaSqft: o.area, floors: o.style === 'Row House' || o.style === 'Duplex' ? 2 : undefined,
    facing: FACINGS[int(0, 7)], furnished: o.furn, condition: 'Completed', newConstruction: false, yearBuilt: int(2012, 2023),
    address: `${int(10, 250)}, ${o.loc}`, city: 'Bengaluru', zip: loc.zip, lat: jitter(loc.lat, 0.006), lng: jitter(loc.lng, 0.006),
    amenities: subset(AMEN_APT, 4, 8), ownerId: owners[o.owner].id, agentId: i % 3 === 0 ? agents[0].id : agents[1 + (i % 5)].id,
    brokerId: i % 4 === 1 ? brokers[1 + (i % 4)].id : undefined, approval: o.approval ?? 'approved', listingPrivacy: o.priv ?? 'public',
    rejectReason: o.approval === 'rejected' ? 'Ownership documents incomplete - please attach the registered sale deed and khata certificate.' : undefined,
    description: `${o.name} in ${o.loc}, Bengaluru - ${rent ? 'available for lease' : 'resale'}.`,
  });
});
const rentals = others.slice(0, 11);
const resales = others.slice(11);
void resales;
const villas = properties.slice(0, villaCount);

// ---------- users ----------
const users: User[] = [];
function addUser(email: string, name: string, role: User['role'], linkedId?: string, phoneNo?: string) {
  users.push({ id: `usr-${pad(users.length + 1, 2)}`, createdAt: ts(ago(330)), name, email, password: 'demo123', role, phone: phoneNo, active: true, linkedId });
}
addUser('admin@regalpark.demo', 'Regal Park Admin', 'admin', undefined, '+91 90080 32626');
addUser('sales@regalpark.demo', staff[0].name, 'staff', staff[0].id, staff[0].phone);
addUser('agent@regalpark.demo', agents[0].name, 'agent', agents[0].id, agents[0].phone);
addUser('broker@regalpark.demo', brokers[0].name, 'broker', brokers[0].id, brokers[0].phone);
addUser('owner@regalpark.demo', owners[1].name, 'owner', owners[1].id, owners[1].phone);
addUser('client@regalpark.demo', clients[0].name, 'client', clients[0].id, clients[0].phone);
for (const i of [1, 2, 3]) addUser(staff[i].email, staff[i].name, 'staff', staff[i].id, staff[i].phone);
for (const i of [1, 2]) addUser(agents[i].email, agents[i].name, 'agent', agents[i].id, agents[i].phone);
const uid = (email: string) => users.find(u => u.email === email)!.id;

// ---------- leads ----------
const SRC: [Lead['source'], number][] = [['Website', 22], ['99acres', 14], ['MagicBricks', 12], ['Housing.com', 10], ['Channel Partner', 12], ['Google Ads', 9], ['Facebook Ads', 8], ['Walk-in', 7], ['Referral', 6]];
const STAT: [LeadStatus, number][] = [['New', 18], ['Contacted', 16], ['Site Visit Scheduled', 10], ['Site Visit Done', 10], ['Negotiation', 7], ['Booked', 5], ['Lost', 12]];
const NOTES = ['Wants east-facing corner villa', 'NRI - needs video walkthrough', 'Home loan pre-approved with SBI', 'Prefers possession before Dec 2028', 'Interested in clubhouse and sports amenities',
  'Looking for 4BHK close to Infosys campus', 'Will visit with family on weekend', 'Comparing with Prestige and Sobha projects', 'Needs vastu-compliant entrance', 'Investor - wants rental yield details',
  'Asked for payment plan and GST breakup', 'Budget flexible for Elora configuration', 'Relocating from Hyderabad next quarter', 'Callback after 6 PM only', 'Corporate lease - company will pay rent'];
const INTERESTS = ['Riora 4BHK (30x50)', 'Avira 4BHK (35x50)', 'Selora 4BHK (35x55)', 'Elora 5BHK (40x50)'];
const BUDGET: Record<string, [number, number]> = { 'Riora 4BHK (30x50)': [40e5 * 10, 47e5 * 10], 'Avira 4BHK (35x50)': [48e5 * 10, 55e5 * 10], 'Selora 4BHK (35x55)': [52e5 * 10, 60e5 * 10], 'Elora 5BHK (40x50)': [60e5 * 10, 70e5 * 10] };
const assignPool = [uid('sales@regalpark.demo'), uid('agent@regalpark.demo'), users[6].id, uid('agent@regalpark.demo'), users[7].id, uid('sales@regalpark.demo'), users[8].id, uid('broker@regalpark.demo'), uid('agent@regalpark.demo'), users[6].id];
const leads: Lead[] = [];
const leadDays = Array.from({ length: 70 }, () => int(0, 119)).sort((a, b) => b - a);
for (let i = 0; i < 70; i++) {
  const name = person();
  const status = weighted(STAT);
  const rental = i % 9 === 4;
  const interest = rental ? pick(['Rental - 2BHK', 'Rental - 3BHK']) : pick(INTERESTS);
  const created = ago(leadDays[i]);
  let siteVisitDate: string | undefined;
  if (status === 'Site Visit Scheduled') siteVisitDate = addDays(TODAY, int(1, 14));
  else if (status === 'Site Visit Done' || status === 'Negotiation' || status === 'Booked') siteVisitDate = addDays(created, Math.min(int(2, 12), leadDays[i]));
  const budget = rental ? undefined : roundTo(BUDGET[interest][0] + rnd() * (BUDGET[interest][1] - BUDGET[interest][0]), 500000);
  const cfgIdx = INTERESTS.indexOf(interest);
  leads.push({
    id: `led-${pad(i + 1, 3)}`, createdAt: ts(created, int(9, 20), int(0, 59)), name, phone: phone(), email: rnd() < 0.65 ? emailOf(name, pick(['gmail.com', 'outlook.com', 'yahoo.in', 'example.com'])) : undefined,
    source: weighted(SRC), interest, budget, status, assignedTo: assignPool[i % assignPool.length], siteVisitDate,
    propertyId: cfgIdx >= 0 && rnd() < 0.4 ? villas[cfgIdx * 7 + int(0, 6)].id : rental && rnd() < 0.5 ? rentals[9].id : undefined,
    notes: rnd() < 0.85 ? pick(NOTES) : undefined,
  });
}

// ---------- requests / contracts / invoices / tenants ----------
const requests: PropertyRequest[] = [];
const contracts: Contract[] = [];
const invoices: Invoice[] = [];
const tenants: Tenant[] = [];
const MODES: Payment['mode'][] = ['UPI', 'NEFT', 'RTGS', 'UPI', 'NEFT'];
let brN = 0, rrN = 0;

function mkContract(req: PropertyRequest, signed: boolean, createdDay: string): Contract {
  const c: Contract = {
    id: `con-${pad(contracts.length + 1, 3)}`, createdAt: ts(createdDay, 11), number: `CON-${pad(contracts.length + 1)}`, requestId: req.id, kind: req.kind, clientId: req.clientId, propertyId: req.propertyId,
    amount: req.contractAmount, signed, signedAt: signed ? ts(addDays(createdDay, 2), 15) : undefined,
  };
  contracts.push(c); req.contractId = c.id;
  return c;
}
function mkInvoice(req: PropertyRequest, amount: number, due: string, created: string, kind: 'paid' | 'partial' | 'unpaid' | 'overdue'): Invoice {
  const payments: Payment[] = [];
  const mode = MODES[invoices.length % MODES.length];
  if (kind === 'paid') payments.push({ date: addDays(due, -int(0, 4)), amount, mode, ref: `${mode}${int(10000000, 99999999)}` });
  if (kind === 'partial') payments.push({ date: addDays(due, -2), amount: roundTo(amount / 2, 500), mode, ref: `${mode}${int(10000000, 99999999)}` });
  const status: Invoice['status'] = kind === 'paid' ? 'Paid' : kind === 'partial' ? 'Partially Paid' : kind === 'overdue' ? 'Overdue' : 'Unpaid';
  const inv: Invoice = {
    id: `inv-${pad(invoices.length + 1, 3)}`, createdAt: ts(created, 12), number: `INV-${pad(invoices.length + 1)}`, requestId: req.id, kind: req.kind, clientId: req.clientId, propertyId: req.propertyId,
    amount, dueDate: due, payments, status,
  };
  invoices.push(inv); req.invoiceId = inv.id;
  return inv;
}

// buy requests: [villaIdx, status, clientIdx, invoice kind | undefined, contract signed]
type BuySpec = [number, RequestStatus, number, 'paid' | 'partial' | 'overdue' | undefined, boolean];
const BUY: BuySpec[] = [
  [0, 'Complete', 9, 'paid', true], [8, 'Complete', 10, 'paid', true], [15, 'Complete', 11, 'paid', true],
  [3, 'Approved', 12, 'paid', true], [17, 'Approved', 13, 'paid', true], [1, 'Approved', 0, 'partial', true], [9, 'Approved', 14, 'overdue', false],
  [16, 'Waiting for approval', 15, undefined, false], [22, 'Waiting for approval', 16, undefined, false], [25, 'Sent', 17, undefined, false],
  [4, 'Submitted', 18, undefined, false], [10, 'Submitted', 19, undefined, false], [6, 'Draft', 20, undefined, false],
  [11, 'Cancelled', 21, undefined, false], [18, 'Cancelled', 22, undefined, false], [20, 'Expired', 23, undefined, false],
];
BUY.forEach(([vi, status, ci, invKind, signed], i) => {
  const v = villas[vi];
  brN++;
  const age = status === 'Complete' ? int(95, 112) : status === 'Approved' ? int(40, 80) : int(3, 60);
  const created = ago(age);
  const contractAmount = roundTo(v.price * (1 - rnd() * 0.03), 100000);
  const req: PropertyRequest = {
    id: `req-b${pad(i + 1, 2)}`, createdAt: ts(created, 10, 30), number: `BR-${pad(brN)}`, kind: 'buy', propertyId: v.id, clientId: clients[ci].id, propertyPrice: v.price, contractAmount, termMonths: 0,
    startDate: addDays(created, int(30, 90)), status, inspect: rnd() < 0.6, clientNote: pick(['Please share the payment schedule.', 'Interested in corner plot if available.', 'Home loan sanctioned, ready to proceed.', 'Would like a site inspection first.']),
    adminNote: status === 'Cancelled' ? 'Client withdrew - budget revised.' : status === 'Expired' ? 'No response from client within validity.' : undefined,
  };
  if (req.inspect) req.inspectionDate = addDays(created, int(3, 10));
  requests.push(req);
  if (invKind) {
    mkContract(req, signed, addDays(created, 5));
    const due = invKind === 'overdue' ? '2026-11-10' : addDays(created, 12);
    mkInvoice(req, v.reservationAmount ?? Math.round(contractAmount * 0.1), due, addDays(created, 6), invKind);
  }
});

// rentals: R0..R8 tenanted, R9 vacant, R10 pending
interface TenSpec { rental: number; client: number; start: string; term: number; status: Tenant['status']; inv: 'paid' | 'partial' | 'unpaid' | 'overdue'; due: string; reqStatus: RequestStatus }
const TEN: TenSpec[] = [
  { rental: 0, client: 0, start: '2026-03-01', term: 12, status: 'Active', inv: 'paid', due: '2026-11-05', reqStatus: 'Approved' },
  { rental: 1, client: 1, start: '2026-01-16', term: 11, status: 'Active', inv: 'paid', due: '2026-11-05', reqStatus: 'Approved' },
  { rental: 2, client: 2, start: '2026-02-21', term: 11, status: 'Active', inv: 'partial', due: '2026-11-05', reqStatus: 'Approved' },
  { rental: 3, client: 3, start: '2026-06-01', term: 12, status: 'Active', inv: 'paid', due: '2026-11-05', reqStatus: 'Approved' },
  { rental: 4, client: 4, start: '2026-08-01', term: 11, status: 'Active', inv: 'overdue', due: '2026-11-05', reqStatus: 'Approved' },
  { rental: 5, client: 5, start: '2026-09-15', term: 12, status: 'Active', inv: 'unpaid', due: '2026-12-01', reqStatus: 'Approved' },
  { rental: 6, client: 6, start: '2026-05-10', term: 12, status: 'Active', inv: 'partial', due: '2026-11-05', reqStatus: 'Approved' },
  { rental: 7, client: 7, start: '2026-04-01', term: 12, status: 'Notice Period', inv: 'paid', due: '2026-11-05', reqStatus: 'Approved' },
  { rental: 8, client: 8, start: '2025-10-01', term: 12, status: 'Ended', inv: 'paid', due: '2026-09-05', reqStatus: 'Complete' },
];
TEN.forEach((t, i) => {
  const p = rentals[t.rental];
  rrN++;
  const created = addDays(t.start, -int(14, 25));
  const end = addDays(addMonths(t.start, t.term), -1);
  const req: PropertyRequest = {
    id: `req-r${pad(i + 1, 2)}`, createdAt: ts(created, 10, 15), number: `RR-${pad(rrN)}`, kind: 'rent', propertyId: p.id, clientId: clients[t.client].id, propertyPrice: p.price, contractAmount: p.price * t.term,
    termMonths: t.term, startDate: t.start, endDate: end, status: t.reqStatus, inspect: true, inspectionDate: addDays(created, 3), clientNote: pick(['Need parking for two cars.', 'Family of four, 11-month agreement preferred.', 'Company lease, GST invoice required.']),
  };
  requests.push(req);
  mkContract(req, true, addDays(created, 6));
  mkInvoice(req, p.price, t.due, addDays(t.due, -9), t.inv);
  tenants.push({
    id: `ten-${pad(i + 1, 2)}`, createdAt: ts(addDays(t.start, -2), 9), referenceNo: `TN-${pad(i + 1)}`, clientId: clients[t.client].id, propertyId: p.id, requestId: req.id,
    leaseStart: t.start, leaseEnd: end, monthlyRent: p.price, deposit: p.price * (t.rental === 7 || t.rental === 5 ? 6 : 3), status: t.status,
  });
});
// 3 non-approved rent requests
([[9, 'Submitted', 12], [8, 'Waiting for approval', 13], [9, 'Cancelled', 14]] as [number, RequestStatus, number][]).forEach(([ri, status, ci]) => {
  rrN++;
  const p = rentals[ri];
  const created = ago(int(2, 25));
  requests.push({
    id: `req-r${pad(rrN, 2)}`, createdAt: ts(created, 14), number: `RR-${pad(rrN)}`, kind: 'rent', propertyId: p.id, clientId: clients[ci].id, propertyPrice: p.price, contractAmount: p.price * 11, termMonths: 11,
    startDate: addDays(TODAY, int(10, 40)), endDate: undefined, status, inspect: false, clientNote: 'Looking to move in next month.',
    adminNote: status === 'Cancelled' ? 'Client found another unit.' : undefined,
  });
});
void brokers; void agents;

// ---------- assemble ----------
const settings: DB['settings'] = {
  companyName: 'Sterlitee Developers', productName: 'Regal Park CRM', projectName: 'Sterlitee Regal Park', tagline: 'Your Private World, Nestled in Electronic City',
  rera: 'PRM/KA/RERA/1251/308/PR/180925/008098', phone: '+91 90080 32626', email: 'info@sterlitee.in',
  address: 'Sterlitee Regal Park, Neotown, Electronic City Phase 1, Bengaluru, Karnataka 560100', currency: 'INR', showBrokerPortal: true, requirePropertyApproval: true,
  prefixes, nextNumbers: {
    property: properties.length + 1, owner: owners.length + 1, agent: agents.length + 1, broker: brokers.length + 1, staff: staff.length + 1, client: clients.length + 1,
    buy: requests.filter(r => r.kind === 'buy').length + 1, rent: requests.filter(r => r.kind === 'rent').length + 1, invoice: invoices.length + 1, contract: contracts.length + 1, tenant: tenants.length + 1,
  },
};
const db: DB = {
  users, owners, staff, agents, brokers, clients, properties, leads, requests, tenants, contracts, invoices, plans, settings,
  permissions: JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS)),
  x: {}, xNext: {}, moduleSettings: {},
};
const gen = generateRegistryData(REGISTRY, db, rnd, TODAY);
Object.assign(db, gen);

// ---------- integrity ----------
const errors: string[] = [];
const ids = (arr: { id: string }[]) => new Set(arr.map(x => x.id));
const S = {
  own: ids(owners), agt: ids(agents), brk: ids(brokers), cli: ids(clients), prp: ids(properties), req: ids(requests), con: ids(contracts), inv: ids(invoices), usr: ids(users), plan: ids(plans),
};
const chk = (set: Set<string>, v: string | undefined, label: string) => { if (v !== undefined && !set.has(v)) errors.push(`${label} -> ${v}`); };
for (const [name, arr] of Object.entries({ users, owners, staff, agents, brokers, clients, properties, leads, requests, tenants, contracts, invoices, plans })) {
  const seen = new Set<string>();
  for (const r of arr as { id: string }[]) { if (seen.has(r.id)) errors.push(`duplicate id ${name}:${r.id}`); seen.add(r.id); }
}
for (const p of properties) { chk(S.own, p.ownerId, `property ${p.code}.ownerId`); chk(S.agt, p.agentId, `property ${p.code}.agentId`); chk(S.brk, p.brokerId, `property ${p.code}.brokerId`); }
for (const l of leads) { chk(S.usr, l.assignedTo, `lead ${l.id}.assignedTo`); chk(S.prp, l.propertyId, `lead ${l.id}.propertyId`); }
for (const r of requests) { chk(S.prp, r.propertyId, `req ${r.number}.propertyId`); chk(S.cli, r.clientId, `req ${r.number}.clientId`); chk(S.con, r.contractId, `req ${r.number}.contractId`); chk(S.inv, r.invoiceId, `req ${r.number}.invoiceId`); }
for (const t of tenants) { chk(S.cli, t.clientId, `tenant ${t.referenceNo}.clientId`); chk(S.prp, t.propertyId, `tenant ${t.referenceNo}.propertyId`); chk(S.req, t.requestId, `tenant ${t.referenceNo}.requestId`); }
for (const c of contracts) { chk(S.req, c.requestId, `contract ${c.number}.requestId`); chk(S.cli, c.clientId, `contract ${c.number}.clientId`); chk(S.prp, c.propertyId, `contract ${c.number}.propertyId`); }
for (const i of invoices) { chk(S.req, i.requestId, `invoice ${i.number}.requestId`); chk(S.cli, i.clientId, `invoice ${i.number}.clientId`); chk(S.prp, i.propertyId, `invoice ${i.number}.propertyId`); }
for (const a of agents) chk(S.plan, a.planId, `agent ${a.code}.planId`);
for (const b of brokers) chk(S.plan, b.planId, `broker ${b.code}.planId`);
const linkSets: Record<string, Set<string>> = { staff: ids(staff), agent: S.agt, broker: S.brk, owner: S.own, client: S.cli };
for (const u of users) {
  if (u.role === 'admin') continue;
  if (!u.linkedId || !linkSets[u.role].has(u.linkedId)) errors.push(`user ${u.email}.linkedId -> ${u.linkedId}`);
}
const xIds: Record<string, Set<string>> = Object.fromEntries(Object.entries(gen.x).map(([k, v]) => [k, ids(v as { id: string }[])]));
const coreSets: Record<string, Set<string>> = { clients: S.cli, users: S.usr, properties: S.prp, staff: ids(staff), agents: S.agt, brokers: S.brk, owners: S.own, leads: ids(leads) };
for (const [k, arr] of Object.entries(gen.x)) {
  const seen = new Set<string>();
  for (const r of arr) { if (seen.has(r.id)) errors.push(`duplicate id x:${r.id}`); seen.add(r.id); }
  for (const r of arr) chk(S.usr, r.createdBy, `x ${r.id}.createdBy`);
}
for (const e of REGISTRY.flatMap(m => m.entities)) {
  for (const f of e.fields) {
    if (f.type !== 'ref' || !f.ref) continue;
    const set = coreSets[f.ref] ?? xIds[f.ref];
    if (!set) { errors.push(`x ${e.key}.${f.key} -> unknown ref target ${f.ref}`); continue; }
    for (const r of gen.x[e.key]) chk(set, r[f.key], `x ${r.id}.${f.key}`);
    if (!gen.x[e.key].some(r => r[f.key] !== undefined)) console.warn(`note: ${e.key}.${f.key} -> ${f.ref} has no values (target empty or generated later)`);
  }
}
// demo minimums
const agU = uid('agent@regalpark.demo'), brU = uid('broker@regalpark.demo'), owU = users.find(u => u.email === 'owner@regalpark.demo')!, clU = users.find(u => u.email === 'client@regalpark.demo')!;
const cAgent = properties.filter(p => p.agentId === agents[0].id).length;
const cAgentLeads = leads.filter(l => l.assignedTo === agU).length;
const cBroker = properties.filter(p => p.brokerId === brokers[0].id).length;
const ownerRentals = properties.filter(p => p.ownerId === owU.linkedId && p.transactionType === 'Rent');
const ownerTenancies = tenants.filter(t => ownerRentals.some(p => p.id === t.propertyId)).length;
const clientBuy = requests.filter(r => r.kind === 'buy' && r.clientId === clU.linkedId).length;
const clientTen = tenants.filter(t => t.clientId === clU.linkedId).length;
const clientInv = invoices.filter(i => i.clientId === clU.linkedId).length;
if (cAgent < 6) errors.push(`agent props ${cAgent} < 6`);
if (cAgentLeads < 8) errors.push(`agent leads ${cAgentLeads} < 8`);
if (cBroker < 4) errors.push(`broker props ${cBroker} < 4`);
if (ownerRentals.length < 3 || ownerTenancies < 1) errors.push('owner minimums');
if (!clientBuy || !clientTen || !clientInv) errors.push('client minimums');

const CHECK = process.argv.includes('--check');
const dir = path.resolve(process.cwd(), 'data');
const json = JSON.stringify(db, null, 2) + '\n';
if (!CHECK) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'seed.json'), json);
}

const by = <T,>(arr: T[], f: (x: T) => string) => arr.reduce<Record<string, number>>((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
const soon = tenants.filter(t => t.status === 'Active' && ms(t.leaseEnd) - ms(TODAY) <= 90 * DAY).length;
console.log(CHECK ? 'Check only (seed.json not written)' : 'Seed written: data/seed.json');
console.log(`users ${users.length} | owners ${owners.length} | staff ${staff.length} | agents ${agents.length} | brokers ${brokers.length} | clients ${clients.length} | plans ${plans.length}`);
console.log(`properties ${properties.length} (villas ${villaCount}, other ${others.length}) | approval ${JSON.stringify(by(properties, p => p.approval))}`);
console.log(`leads ${leads.length} ${JSON.stringify(by(leads, l => l.status))}`);
console.log(`requests ${requests.length} (buy ${requests.filter(r => r.kind === 'buy').length}, rent ${requests.filter(r => r.kind === 'rent').length}) ${JSON.stringify(by(requests, r => r.status))}`);
console.log(`tenants ${tenants.length} ${JSON.stringify(by(tenants, t => t.status))} ending<=90d ${soon} | contracts ${contracts.length} | invoices ${invoices.length} ${JSON.stringify(by(invoices, i => i.status))}`);
console.log(`demo: agent props ${cAgent}, agent leads ${cAgentLeads}, broker props ${cBroker}, owner rentals ${ownerRentals.length} (tenancies ${ownerTenancies}), client buy ${clientBuy}/tenancy ${clientTen}/invoices ${clientInv}`);
if (errors.length) {
  console.error('FK/integrity errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`registry: ${Object.keys(gen.x).length} entities, ${Object.values(gen.x).reduce((n, a) => n + a.length, 0)} records, ${Object.keys(gen.moduleSettings).length} module settings`);
if (CHECK) for (const m of REGISTRY) console.log(`  ${m.key}: ${m.entities.map(e => `${e.key} ${gen.x[e.key]?.length ?? 0}`).join(', ')}`);
console.log(`seed.json ${CHECK ? 'projected ' : ''}${(Buffer.byteLength(json) / 1024).toFixed(0)} KB`);
console.log('Integrity OK');
