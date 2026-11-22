export type Role = 'admin'|'staff'|'agent'|'broker'|'owner'|'client';
export interface Base { id: string; createdAt: string; createdBy?: string }
export interface User extends Base { name: string; email: string; password: string; role: Role; phone?: string; active: boolean; linkedId?: string } // linkedId → agents/brokers/owners/clients/staff record
export interface Owner extends Base { code: string; name: string; email: string; phone: string; city: string; state: string; address?: string; pan?: string; active: boolean }
export interface Staff extends Base { code: string; name: string; email: string; phone: string; designation: string; approvalManager: boolean; requireApproval: boolean; isPublic: boolean; active: boolean; lastLogin?: string }
export interface Agent extends Base { code: string; name: string; email: string; phone: string; city: string; reraAgentNo?: string; planId?: string; verified: boolean; isPublic: boolean; active: boolean }
export interface Broker extends Base { code: string; name: string; email: string; phone: string; city: string; reraAgentNo?: string; planId?: string; active: boolean }
export interface Client extends Base { code: string; name: string; email: string; phone: string; city: string; type: 'Buyer'|'Tenant'|'Investor'; company?: string }
export type PropertyStatus = 'Pending'|'New'|'Active'|'Pending Sale'|'Closed Sale'|'Sold'|'Rented'|'Temp off Market'|'Withdrawn'|'Cancelled'|'Backup'|'Expired';
export interface Property extends Base { code: string; name: string; project?: string; listingType: 'Housing'|'Business'|'Agriculture'|'Government';
  style: 'Villa'|'Apartment'|'Plot'|'Duplex'|'Penthouse'|'Commercial'|'Office'|'Row House'; status: PropertyStatus; transactionType: 'Sale'|'Rent';
  price: number; rentalPrice?: number; rentalType?: 'Month(s)'|'Year(s)'; reservationAmount?: number; maintenanceFee?: number;
  beds: number; baths: number; areaSqft: number; plotSqft?: number; floors?: number; facing?: 'East'|'West'|'North'|'South'|'North-East'|'North-West'|'South-East'|'South-West';
  furnished: 'Unfurnished'|'Semi-Furnished'|'Fully Furnished'; condition: 'Completed'|'Under Construction'|'Pre Construction'|'Under Renovation'; newConstruction: boolean;
  yearBuilt?: number; possessionDate?: string; address: string; city: string; state: string; zip: string; lat?: number; lng?: number;
  amenities: string[]; ownerId?: string; agentId?: string; brokerId?: string; approval: 'pending'|'approved'|'rejected'; rejectReason?: string;
  listingPrivacy: 'public'|'internal'; description?: string; expenses: {label: string; amount: number}[]; rooms: {type: string; level: string; widthFt: number; lengthFt: number}[] }
export type LeadStatus = 'New'|'Contacted'|'Site Visit Scheduled'|'Site Visit Done'|'Negotiation'|'Booked'|'Lost';
export interface Lead extends Base { name: string; phone: string; email?: string; source: 'Website'|'99acres'|'MagicBricks'|'Housing.com'|'Walk-in'|'Referral'|'Channel Partner'|'Facebook Ads'|'Google Ads';
  interest: string; budget?: number; status: LeadStatus; assignedTo?: string /* user id */; siteVisitDate?: string; propertyId?: string; notes?: string }
export type RequestStatus = 'Draft'|'Submitted'|'Sent'|'Waiting for approval'|'Approved'|'Cancelled'|'Complete'|'Expired';
export interface PropertyRequest extends Base { number: string; kind: 'buy'|'rent'; propertyId: string; clientId: string; propertyPrice: number; contractAmount: number;
  termMonths: number; startDate: string /* expected buy date OR preferred lease start */; endDate?: string; status: RequestStatus; inspect: boolean; inspectionDate?: string;
  clientNote?: string; adminNote?: string; contractId?: string; invoiceId?: string }
export interface Tenant extends Base { referenceNo: string; clientId: string; propertyId: string; requestId: string; leaseStart: string; leaseEnd: string; monthlyRent: number; deposit: number; status: 'Active'|'Notice Period'|'Ended' }
export interface Contract extends Base { number: string; requestId: string; kind: 'buy'|'rent'; clientId: string; propertyId: string; amount: number; signed: boolean; signedAt?: string }
export interface Payment { date: string; amount: number; mode: 'UPI'|'NEFT'|'RTGS'|'Cheque'|'Cash' ; ref?: string }
export interface Invoice extends Base { number: string; requestId?: string; kind: 'buy'|'rent'; clientId: string; propertyId: string; amount: number; dueDate: string; payments: Payment[]; status: 'Unpaid'|'Partially Paid'|'Paid'|'Overdue'|'Cancelled' }
export interface Plan extends Base { name: string; monthlyListings: number; rate: number; paymentType: 'Monthly'|'Yearly'; description?: string }
export interface Settings { companyName: string; productName: string; projectName: string; tagline: string; rera: string; phone: string; email: string; address: string;
  currency: 'INR'; showBrokerPortal: boolean; requirePropertyApproval: boolean;
  prefixes: { property: string; owner: string; agent: string; broker: string; staff: string; client: string; buy: string; rent: string; invoice: string; contract: string; tenant: string };
  nextNumbers: Record<keyof Settings['prefixes'], number> }
export type Action = 'view'|'create'|'edit'|'delete';
export type Module = 'dashboard'|'properties'|'approvals'|'leads'|'owners'|'staff'|'agents'|'brokers'|'clients'|'buyRequests'|'rentRequests'|'tenants'|'invoices'|'contracts'|'reports'|'settings'|`m:${string}`;
export type PermissionMatrix = Record<Role, Partial<Record<Module, Action[]>>>;
export interface DB { users: User[]; owners: Owner[]; staff: Staff[]; agents: Agent[]; brokers: Broker[]; clients: Client[]; properties: Property[]; leads: Lead[];
  requests: PropertyRequest[]; tenants: Tenant[]; contracts: Contract[]; invoices: Invoice[]; plans: Plan[]; settings: Settings; permissions: PermissionMatrix;
  x: Record<string, any[]>; xNext: Record<string, number>; moduleSettings: Record<string, Record<string, any>> }

export const MODULES: Module[] = ['dashboard', 'properties', 'approvals', 'leads', 'owners', 'staff', 'agents', 'brokers', 'clients', 'buyRequests', 'rentRequests', 'tenants', 'invoices', 'contracts', 'reports', 'settings'];
export const ROLES: Role[] = ['admin', 'staff', 'agent', 'broker', 'owner', 'client'];
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator', staff: 'Sales Staff', agent: 'Real Estate Agent', broker: 'Business Broker', owner: 'Property Owner', client: 'Client',
};
export const PROPERTY_STATUSES: PropertyStatus[] = ['Pending', 'New', 'Active', 'Pending Sale', 'Closed Sale', 'Sold', 'Rented', 'Temp off Market', 'Withdrawn', 'Cancelled', 'Backup', 'Expired'];
export const REQUEST_STATUSES: RequestStatus[] = ['Draft', 'Submitted', 'Sent', 'Waiting for approval', 'Approved', 'Cancelled', 'Complete', 'Expired'];
export const LEAD_STATUSES: LeadStatus[] = ['New', 'Contacted', 'Site Visit Scheduled', 'Site Visit Done', 'Negotiation', 'Booked', 'Lost'];
export const LEAD_SOURCES: Lead['source'][] = ['Website', '99acres', 'MagicBricks', 'Housing.com', 'Walk-in', 'Referral', 'Channel Partner', 'Facebook Ads', 'Google Ads'];

export type Collection = 'owners' | 'staff' | 'agents' | 'brokers' | 'clients' | 'properties' | 'leads' | 'requests' | 'tenants' | 'contracts' | 'invoices' | 'plans' | 'users';
export const COLLECTION_MODULE: Record<Collection, Module | 'requests'> = {
  owners: 'owners', staff: 'staff', agents: 'agents', brokers: 'brokers', clients: 'clients', properties: 'properties', leads: 'leads',
  requests: 'requests', tenants: 'tenants', contracts: 'contracts', invoices: 'invoices', plans: 'settings', users: 'settings',
};
/** Resolve the permission module for a collection; requests resolve by kind. */
export function moduleFor(collection: string, kind?: 'buy' | 'rent'): Module | undefined {
  if (!Object.hasOwn(COLLECTION_MODULE, collection)) return undefined;
  const m = COLLECTION_MODULE[collection as Collection];
  if (m === 'requests') return kind === 'rent' ? 'rentRequests' : 'buyRequests';
  return m;
}
