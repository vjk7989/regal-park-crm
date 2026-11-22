import React, { createContext, useCallback, useContext, useState } from 'react';

export function Button({ variant = 'primary', size, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'gold' | 'ghost' | 'danger' | 'success'; size?: 'sm' }) {
  return <button {...rest} className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${className}`} />;
}

const STATUS_COLORS: Record<string, string> = {
  // green
  Active: 'green', Approved: 'green', Complete: 'green', Paid: 'green', Sold: 'green', Rented: 'green', Booked: 'green', approved: 'green', 'Closed Sale': 'green',
  // amber
  Pending: 'amber', 'Pending Sale': 'amber', 'Waiting for approval': 'amber', 'Partially Paid': 'amber', 'Notice Period': 'amber', pending: 'amber',
  Negotiation: 'amber', Backup: 'amber', 'Temp off Market': 'amber', Unpaid: 'amber',
  // blue
  New: 'blue', Submitted: 'blue', Sent: 'blue', Contacted: 'blue', 'Site Visit Scheduled': 'blue', 'Site Visit Done': 'blue',
  // red
  Overdue: 'red', Cancelled: 'red', Lost: 'red', Expired: 'red', rejected: 'red', Withdrawn: 'red',
  // grey
  Draft: 'grey', Ended: 'grey', Inactive: 'grey',
};

export function Badge({ color = 'grey', children }: { color?: string; children: React.ReactNode }) {
  return <span className={`badge badge-${color}`}>{children}</span>;
}
export function StatusBadge({ status }: { status: string }) {
  return <Badge color={STATUS_COLORS[status] ?? 'grey'}>{status}</Badge>;
}

export function Card({ title, actions, children, className = '' }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && <div className="card-head"><h3>{title}</h3><div>{actions}</div></div>}
      <div className="card-body">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className={`stat-card ${tone ? 'tone-' + tone : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(t => (
        <button key={t.id} role="tab" aria-selected={t.id === active} className={`tab ${t.id === active ? 'active' : ''}`} onClick={() => onChange(t.id)} type="button">{t.label}</button>
      ))}
    </div>
  );
}

export function ConfirmDialog({ open, title = 'Please confirm', message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: {
  open: boolean; title?: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void | Promise<void>; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-sm" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3></div>
        <div className="modal-body">{message}</div>
        <div className="modal-foot">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => void onConfirm()}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}

export function Empty({ message = 'Nothing to show yet.' }: { message?: string }) {
  return <div className="empty">{message}</div>;
}

/** Topbar search text; DataTable filters by it. */
export const SearchCtx = createContext<string>('');

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string }
type ToastFn = (message: string, kind?: ToastKind) => void;
const ToastCtx = createContext<ToastFn>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback<ToastFn>((message, kind = 'success') => {
    const id = Date.now() + Math.random();
    setItems(s => [...s, { id, kind, message }]);
    setTimeout(() => setItems(s => s.filter(i => i.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map(i => <div key={i.id} className={`toast toast-${i.kind}`}>{i.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
