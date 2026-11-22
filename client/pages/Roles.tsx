import React, { useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, TrendingUp, Briefcase, Handshake, Home, User, type LucideIcon } from 'lucide-react';
import { BRANDING, useAuth } from '../auth';
import { Badge, Button, useToast } from '../components/ui';
import { DEFAULT_PERMISSIONS } from '../../shared/permissions';
import { ROLES, ROLE_LABELS } from '../../shared/types';
import type { Module, Role } from '../../shared/types';

const INFO: Record<Role, { icon: LucideIcon; desc: string; email: string }> = {
  admin: { icon: Shield, desc: 'Full control: listings, approvals, people, billing, reports, settings', email: 'admin@regalpark.demo' },
  staff: { icon: TrendingUp, desc: 'Sales team: leads, properties, buy/rent requests', email: 'sales@regalpark.demo' },
  agent: { icon: Briefcase, desc: 'Their own listings and assigned leads', email: 'agent@regalpark.demo' },
  broker: { icon: Handshake, desc: 'Channel partner: own listings, owners, buy requests, invoices', email: 'broker@regalpark.demo' },
  owner: { icon: Home, desc: 'Their properties, tenants, invoices and contracts', email: 'owner@regalpark.demo' },
  client: { icon: User, desc: 'Browse approved listings, raise buy/rent requests, view own invoices', email: 'client@regalpark.demo' },
};

const MODULE_LABELS: Record<Module, string> = {
  dashboard: 'Dashboard', properties: 'Properties', approvals: 'Approvals', leads: 'Leads', owners: 'Owners', staff: 'Staff', agents: 'Agents',
  brokers: 'Brokers', clients: 'Clients', buyRequests: 'Buy Requests', rentRequests: 'Rental Requests', tenants: 'Tenants', invoices: 'Invoices',
  contracts: 'Contracts', reports: 'Reports', settings: 'Settings',
};

let switching: Role | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export default function Roles() {
  const { user, permissions, settings, login, logout } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  // Module-level: logout() remounts this page (Layout <-> public wrapper), so the in-flight switch must survive it.
  const busy = useSyncExternalStore(subscribe, () => switching);
  const setBusy = (r: Role | null) => { switching = r; listeners.forEach(l => l()); };
  const matrix = user ? permissions : DEFAULT_PERMISSIONS;

  const switchTo = async (role: Role) => {
    if (switching) return;
    setBusy(role);
    try {
      if (user) logout(); // posts /auth/logout with the still-valid token, then clears local session
      await login(INFO[role].email, 'demo123');
      nav('/');
      setBusy(null);
    } catch (e) {
      setBusy(null);
      toast((e as Error).message, 'error'); // session already cleared by logout(): page is the logged-out /roles
    }
  };

  return (
    <div className={user ? '' : 'roles-public'}>
      {!user && <div className="roles-brand"><div className="login-logo">REGAL PARK</div><div className="login-by">by Sterlitee</div><p className="muted">{BRANDING.tagline}</p></div>}
      <h1 className="roles-title">Choose a role to explore Regal Park CRM</h1>
      <div className="roles-grid">
        {ROLES.map(role => {
          const { icon: Icon, desc, email } = INFO[role];
          const views = Object.entries(matrix[role] ?? {}).filter(([, a]) => a?.includes('view')).map(([m]) => m as Module);
          const disabled = role === 'broker' && settings.showBrokerPortal === false;
          return (
            <div key={role} className="card role-card">
              <div className="card-body">
                <div className="role-card-head">
                  <Icon size={28} />
                  <h3>{ROLE_LABELS[role]}</h3>
                  {user?.role === role && <Badge color="green">Current</Badge>}
                  {disabled && <Badge color="red">Portal disabled</Badge>}
                </div>
                <p>{desc}</p>
                <p className="muted">{email}</p>
                <div className="chip-group">
                  {views.map(m => <span key={m} className="chip">{MODULE_LABELS[m] ?? m}</span>)}
                </div>
                <Button disabled={busy !== null} onClick={() => void switchTo(role)}>
                  {busy === role ? 'Switching...' : `View as ${ROLE_LABELS[role]}`}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
