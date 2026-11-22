import type { Module } from '../../shared/types';

export type EntityKey = 'owners' | 'staff' | 'agents' | 'brokers' | 'clients';

export interface EntityField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'select' | 'checkbox';
  required?: boolean;
  options?: string[];
  plans?: boolean; // select options come from GET /plans
  readOnly?: boolean; // table only, not in form
}

export interface EntityConfig {
  title: string;
  singular: string;
  module: Module;
  fields: EntityField[];
  columns: string[]; // field names shown in table
}

const f = (name: string, label: string, type: EntityField['type'] = 'text', extra: Partial<EntityField> = {}): EntityField => ({ name, label, type, ...extra });

const base: EntityField[] = [
  f('code', 'Code', 'text', { readOnly: true }),
  f('name', 'Name', 'text', { required: true }),
  f('email', 'Email', 'email', { required: true }),
  f('phone', 'Phone', 'tel', { required: true }),
];

export const ENTITIES: Record<EntityKey, EntityConfig> = {
  owners: {
    title: 'Property Owners', singular: 'Owner', module: 'owners',
    fields: [...base, f('city', 'City'), f('state', 'State'), f('address', 'Address'), f('pan', 'PAN'), f('active', 'Active', 'checkbox')],
    columns: ['code', 'name', 'email', 'phone', 'city', 'state', 'active'],
  },
  staff: {
    title: 'My Staff', singular: 'Staff member', module: 'staff',
    fields: [...base, f('designation', 'Designation'), f('approvalManager', 'Approval manager', 'checkbox'), f('requireApproval', 'Require approval', 'checkbox'),
      f('isPublic', 'Public', 'checkbox'), f('active', 'Active', 'checkbox'), f('lastLogin', 'Last login', 'text', { readOnly: true })],
    columns: ['code', 'name', 'email', 'phone', 'designation', 'approvalManager', 'requireApproval', 'isPublic', 'active', 'lastLogin'],
  },
  agents: {
    title: 'Real Estate Agents', singular: 'Agent', module: 'agents',
    fields: [...base, f('city', 'City'), f('reraAgentNo', 'RERA agent no.'), f('planId', 'Plan', 'select', { plans: true }),
      f('verified', 'Verified', 'checkbox'), f('isPublic', 'Public', 'checkbox'), f('active', 'Active', 'checkbox')],
    columns: ['code', 'name', 'email', 'phone', 'city', 'reraAgentNo', 'planId', 'verified', 'isPublic', 'active'],
  },
  brokers: {
    title: 'Business Brokers', singular: 'Broker', module: 'brokers',
    fields: [...base, f('city', 'City'), f('reraAgentNo', 'RERA agent no.'), f('planId', 'Plan', 'select', { plans: true }), f('active', 'Active', 'checkbox')],
    columns: ['code', 'name', 'email', 'phone', 'city', 'reraAgentNo', 'planId', 'active'],
  },
  clients: {
    title: 'Clients', singular: 'Client', module: 'clients',
    fields: [...base, f('city', 'City'), f('type', 'Type', 'select', { options: ['Buyer', 'Tenant', 'Investor'] }), f('company', 'Company')],
    columns: ['code', 'name', 'email', 'phone', 'city', 'type', 'company'],
  },
};
