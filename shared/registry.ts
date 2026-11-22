import { MODULES } from './modules/index';

export type FieldType = 'text'|'textarea'|'number'|'money'|'percent'|'date'|'datetime'|'email'|'tel'|'url'|'select'|'multiselect'|'checkbox'|'ref';
export type Gen = 'person'|'company'|'phone'|'email'|'address'|'locality'|'city'|'sentence'|'paragraph'|'past'|'future'|'recent'|'vehicle'|'plate'|'material'|'product'|'serial'|'hash';
export interface FieldDef { key: string; label: string; type: FieldType; required?: boolean; options?: string[]; ref?: string; list?: boolean; pool?: string[]; min?: number; max?: number; gen?: Gen }
// ref: a core collection name ('clients' | 'users' | 'properties' | 'staff' | 'agents' | 'brokers' | 'owners' | 'leads') OR a registry entity key. Stored value = target id. Display = target titleField (core: name, else code).
export interface EntityDef { key: string; label: string; singular: string; prefix?: string; titleField: string; statusField?: string; dateField?: string; amountField?: string; fields: FieldDef[]; seedCount?: number; kanban?: boolean; calendar?: boolean; lookup?: boolean }
// key: globally unique snake_case, prefixed by module key. prefix: server assigns implicit field 'code' = prefix + 4-digit number. lookup: shown as a tab on the module Settings page, not in the sidebar.
export type PageKind = 'dashboard'|'table'|'report'|'settings'|'calendar'|'info';
export interface PageDef { key: string; label: string; kind: PageKind; entity?: string; entities?: string[]; text?: string }
export interface ModuleDef { key: string; label: string; icon: string; group: 'Sales & CRM'|'Operations'|'Finance'|'People'|'Marketing'|'Tools'; pages: PageDef[]; entities: EntityDef[]; settings?: FieldDef[] }

export const REGISTRY: ModuleDef[] = MODULES;

const mods = new Map(REGISTRY.map(m => [m.key, m]));
const ents = new Map(REGISTRY.flatMap(m => m.entities.map(e => [e.key, e] as const)));
const owners = new Map(REGISTRY.flatMap(m => m.entities.map(e => [e.key, m] as const)));

export const moduleByKey = (key: string): ModuleDef | undefined => mods.get(key);
export const entityByKey = (key: string): EntityDef | undefined => ents.get(key);
export const moduleOfEntity = (key: string): ModuleDef | undefined => owners.get(key);
