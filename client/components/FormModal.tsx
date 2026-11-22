import React, { useState } from 'react';
import { Button } from './ui';

export interface FieldOption { value: string; label: string }
export interface Field {
  name: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'tel' | 'date' | 'select' | 'multiselect' | 'textarea' | 'checkbox';
  options?: FieldOption[];
  required?: boolean;
  placeholder?: string;
  min?: number;
  step?: number;
}
export type FormValues = Record<string, any>;

export default function FormModal({ title, fields, initial = {}, submitLabel = 'Save', onSubmit, onClose }: {
  title: string; fields: Field[]; initial?: FormValues; submitLabel?: string;
  onSubmit: (values: FormValues) => Promise<unknown>; onClose: () => void;
}) {
  const [values, setValues] = useState<FormValues>(() => {
    const v: FormValues = {};
    for (const f of fields) v[f.name] = initial[f.name] ?? (f.type === 'checkbox' ? false : f.type === 'multiselect' ? [] : '');
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const set = (name: string, val: any) => setValues(v => ({ ...v, [name]: val }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.name];
      const empty = f.type === 'multiselect' ? v.length === 0 : f.type === 'checkbox' ? false : v == null || (typeof v === 'string' && v.trim() === '');
      if (f.required && empty) errs[f.name] = `${f.label} is required`;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const out: FormValues = { ...values };
    for (const f of fields) if (f.type === 'number' && out[f.name] !== '') out[f.name] = Number(out[f.name]);
    setBusy(true);
    setFormError('');
    try {
      await onSubmit(out);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  const input = (f: Field) => {
    const v = values[f.name];
    const id = `f-${f.name}`;
    switch (f.type) {
      case 'textarea':
        return <textarea id={id} value={v} placeholder={f.placeholder} rows={3} onChange={e => set(f.name, e.target.value)} />;
      case 'select':
        return (
          <select id={id} value={v} onChange={e => set(f.name, e.target.value)}>
            <option value="">{f.placeholder ?? 'Select...'}</option>
            {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      case 'multiselect':
        return (
          <div className="chip-group" id={id}>
            {f.options?.map(o => {
              const on = (v as string[]).includes(o.value);
              return (
                <button type="button" key={o.value} className={`chip ${on ? 'on' : ''}`}
                  onClick={() => set(f.name, on ? (v as string[]).filter(x => x !== o.value) : [...v, o.value])}>{o.label}</button>
              );
            })}
          </div>
        );
      case 'checkbox':
        return <input id={id} type="checkbox" checked={!!v} onChange={e => set(f.name, e.target.checked)} />;
      default:
        return <input id={id} type={f.type} value={v} placeholder={f.placeholder} min={f.min} step={f.step} onChange={e => set(f.name, e.target.value)} />;
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" role="dialog" aria-modal="true" noValidate onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head"><h3>{title}</h3><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="modal-body">
          {formError && <div className="form-error">{formError}</div>}
          <div className="form-grid">
            {fields.map(f => (
              <div key={f.name} className={`form-field ${f.type === 'textarea' || f.type === 'multiselect' ? 'full' : ''} ${f.type === 'checkbox' ? 'check' : ''}`}>
                <label htmlFor={`f-${f.name}`}>{f.label}{f.required && <span className="req"> *</span>}</label>
                {input(f)}
                {errors[f.name] && <span className="field-error">{errors[f.name]}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving...' : submitLabel}</Button>
        </div>
      </form>
    </div>
  );
}
