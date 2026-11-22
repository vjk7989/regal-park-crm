import React, { useEffect, useState } from 'react';
import { Truck, Wrench, Users, Factory, Package, ShoppingCart, Calculator, ClipboardCheck, Calendar, FileSignature, Megaphone, BarChart3, ShieldAlert, KeyRound, FolderOpen, Sheet, Briefcase, GraduationCap, Target, HardHat, Store, Gift, Handshake, Award, Boxes, Building2, Workflow, Headset, Share2, Star, AtSign, Wallet, Receipt, Landmark, Percent, type LucideIcon } from 'lucide-react';
import { api } from './api';
import { StatusBadge } from './components/ui';
import type { Column } from './components/DataTable';
import type { Field } from './components/FormModal';
import { formatDate, formatINR, formatShort } from '../shared/format';
import type { Action, Module } from '../shared/types';
import { entityByKey, type EntityDef, type FieldDef } from '../shared/registry';

export type Rec = Record<string, any> & { id: string };
export type RefMap = Record<string, { id: string; title: string }[]>;

const CORE_REFS = ['clients', 'users', 'properties', 'staff', 'agents', 'brokers', 'owners', 'leads'];

const ICONS: Record<string, LucideIcon> = { Truck, Wrench, Users, Factory, Package, ShoppingCart, Calculator, ClipboardCheck, Calendar, FileSignature, Megaphone, BarChart3, ShieldAlert, KeyRound, FolderOpen, Sheet, Briefcase, GraduationCap, Target, HardHat, Store, Gift, Handshake, Award, Boxes, Building2, Workflow, Headset, Share2, Star, AtSign, Wallet, Receipt, Landmark, Percent };
export const iconFor = (name: string): LucideIcon => (Object.hasOwn(ICONS, name) ? ICONS[name] : Boxes);
export const modId = (key: string) => `m:${key}` as Module;
export const canM = (can: (m: Module, a: Action) => boolean, key: string, a: Action) => can(modId(key), a);
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Request failed');

/** Fields shown as table columns: list !== false, first 8 (plus explicit list:true and the status field). */
export function listFields(e: EntityDef): FieldDef[] {
  const vis = e.fields.filter(f => f.list !== false);
  const out = vis.filter((f, i) => i < 8 || f.list === true);
  const s = e.statusField && e.fields.find(f => f.key === e.statusField);
  if (s && !out.includes(s)) out.push(s);
  return out;
}

async function loadRef(ref: string): Promise<{ id: string; title: string }[]> {
  const target = entityByKey(ref);
  try {
    const rows = await api.get<Rec[]>(target ? `/x/${ref}` : `/${ref}`);
    return rows.map(r => ({ id: r.id, title: String((target ? r[target.titleField] : r.name) ?? r.code ?? r.id) }));
  } catch {
    return []; // 403 etc: show raw ids
  }
}

/** Loads every ref target used by the given entities once. */
export function useRefs(entities: EntityDef[]): RefMap {
  const [refs, setRefs] = useState<RefMap>({});
  const sig = entities.map(e => e.key).join(',');
  useEffect(() => {
    const keys = [...new Set(entities.flatMap(e => e.fields.filter(f => f.type === 'ref' && f.ref).map(f => f.ref!)))];
    let live = true;
    setRefs({});
    void Promise.all(keys.map(async k => [k, await loadRef(k)] as const)).then(r => { if (live) setRefs(Object.fromEntries(r)); });
    return () => { live = false; };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return refs;
}

export const refTitle = (refs: RefMap, ref: string | undefined, id: unknown) =>
  id == null || id === '' ? '—' : (refs[ref ?? '']?.find(o => o.id === id)?.title ?? String(id));

/** Plain text of a value (CSV, search, view modal). */
export function valueText(f: FieldDef, v: unknown, refs: RefMap): string {
  if (v == null || v === '') return '—';
  switch (f.type) {
    case 'money': return formatINR(Number(v));
    case 'percent': return `${v}%`;
    case 'date': case 'datetime': return formatDate(String(v));
    case 'checkbox': return v ? 'Yes' : 'No';
    case 'multiselect': return Array.isArray(v) ? v.join(', ') : String(v);
    case 'ref': return refTitle(refs, f.ref, v);
    default: return String(v);
  }
}

export function toColumns(e: EntityDef, refs: RefMap): Column<Rec>[] {
  const cols: Column<Rec>[] = [];
  if (e.prefix) cols.push({ key: 'code', label: 'Code' });
  for (const f of listFields(e)) {
    const isNum = f.type === 'money' || f.type === 'number' || f.type === 'percent';
    cols.push({
      key: f.key, label: f.label,
      sortValue: r => (isNum ? Number(r[f.key] ?? 0) : valueText(f, r[f.key], refs)),
      render: r => {
        const v = r[f.key];
        if (v == null || v === '') return '—';
        if (f.key === e.statusField) return React.createElement(StatusBadge, { status: String(v) });
        if (f.type === 'money') return formatShort(Number(v));
        return valueText(f, v, refs);
      },
    });
  }
  return cols;
}

export function toFormFields(e: EntityDef, refs: RefMap): Field[] {
  return e.fields.map(f => {
    const base = { name: f.key, label: f.label, required: f.required };
    switch (f.type) {
      case 'number': case 'money': case 'percent':
        return { ...base, type: 'number' as const, min: f.min ?? 0, step: f.type === 'money' ? 0.01 : 1 };
      case 'select': return { ...base, type: 'select' as const, options: (f.options ?? []).map(o => ({ value: o, label: o })) };
      case 'multiselect': return { ...base, type: 'multiselect' as const, options: (f.options ?? []).map(o => ({ value: o, label: o })) };
      case 'ref': return { ...base, type: 'select' as const, options: (refs[f.ref ?? ''] ?? []).map(o => ({ value: o.id, label: o.title })) };
      case 'datetime': return { ...base, type: 'date' as const };
      case 'url': return { ...base, type: 'text' as const };
      default: return { ...base, type: f.type };
    }
  });
}

/** Drop empty-string optional values so the server does not validate '' as a number/date. */
export const cleanValues = (v: Record<string, any>) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ''));

/** On edit, emptied optional fields are sent as '' so the server clears them. */
export const editValues = (v: Record<string, any>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === undefined ? '' : x]));
