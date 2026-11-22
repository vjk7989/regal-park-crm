import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Building2, CheckSquare, KeyRound, ShoppingCart, UserCheck, FileText, Receipt, FileSignature,
  UserCog, Briefcase, Handshake, UsersRound, BarChart3, Settings as SettingsIcon, LogOut, Menu, Search, Shield, Repeat, ChevronDown, ChevronRight, Home, type LucideIcon,
} from 'lucide-react';
import type { Module } from '../shared/types';
import { useAuth } from './auth';
import { SearchCtx } from './components/ui';
import { REGISTRY } from '../shared/registry';
import { canM, iconFor } from './moduleUtil';

interface NavItem { to: string; label: string; module: Module; icon: LucideIcon }
const RE_ITEMS: NavItem[] = [
  { to: '/real-estate', label: 'Real Estate Dashboard', module: 'dashboard', icon: Home },
  { to: '/leads', label: 'Leads', module: 'leads', icon: Users },
  { to: '/properties', label: 'Properties', module: 'properties', icon: Building2 },
  { to: '/approvals', label: 'Approvals', module: 'approvals', icon: CheckSquare },
  { to: '/buy-requests', label: 'Buy Requests', module: 'buyRequests', icon: ShoppingCart },
  { to: '/rent-requests', label: 'Rental Requests', module: 'rentRequests', icon: KeyRound },
  { to: '/tenants', label: 'Tenants', module: 'tenants', icon: UserCheck },
  { to: '/invoices', label: 'Invoices', module: 'invoices', icon: Receipt },
  { to: '/contracts', label: 'Contracts', module: 'contracts', icon: FileSignature },
  { to: '/owners', label: 'Property Owners', module: 'owners', icon: FileText },
  { to: '/staff', label: 'My Staff', module: 'staff', icon: UserCog },
  { to: '/agents', label: 'Real Estate Agents', module: 'agents', icon: Briefcase },
  { to: '/brokers', label: 'Business Brokers', module: 'brokers', icon: Handshake },
  { to: '/clients', label: 'Clients', module: 'clients', icon: UsersRound },
  { to: '/reports', label: 'Reports', module: 'reports', icon: BarChart3 },
];

const STORE_KEY = 'rp_nav_open';
const loadOpen = (): Record<string, boolean> => {
  try { return { re: true, ...JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') }; } catch { return { re: true }; }
};

const linkCls = ({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? 'active' : ''}`;

function Branch({ id, label, icon: Icon, open, onToggle, children }: { id: string; label: string; icon: LucideIcon; open: boolean; onToggle: (id: string) => void; children: React.ReactNode }) {
  return (
    <div className="nav-branch">
      <button type="button" className="nav-link nav-parent" aria-expanded={open} onClick={() => onToggle(id)}>
        <Icon size={17} /> <span>{label}</span>{open ? <ChevronDown size={14} className="nav-caret" /> : <ChevronRight size={14} className="nav-caret" />}
      </button>
      {open && <div className="nav-children">{children}</div>}
    </div>
  );
}

function Sidebar() {
  const { can, settings } = useAuth();
  const loc = useLocation();
  const [open, setOpen] = useState<Record<string, boolean>>(loadOpen);
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();

  const toggle = (id: string) => setOpen(o => {
    const n = { ...o, [id]: !o[id] };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  useEffect(() => {
    const m = /^\/m\/([^/]+)/.exec(loc.pathname);
    const id = m ? m[1] : RE_ITEMS.some(i => loc.pathname.startsWith(i.to)) ? 're' : null;
    if (id) setOpen(o => (o[id] ? o : { ...o, [id]: true }));
  }, [loc.pathname]);

  const match = (t: string) => !q || t.toLowerCase().includes(q);
  const reItems = RE_ITEMS.filter(i => can(i.module, 'view'));
  const reAll = match('real estate');
  const reShown = reAll ? reItems : reItems.filter(i => match(i.label));

  const groups: string[] = [];
  for (const m of REGISTRY) if (!groups.includes(m.group)) groups.push(m.group);

  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo-main">REGAL PARK</div>
        <div className="logo-sub">by Sterlitee</div>
      </div>
      <div className="nav-filter"><input aria-label="Filter menu" placeholder="Filter menu" value={filter} onChange={e => setFilter(e.target.value)} /></div>
      <nav>
        {can('dashboard', 'view') && match('dashboard') && (
          <div className="nav-group"><NavLink to="/" end className={linkCls}><LayoutDashboard size={17} /> <span>Dashboard</span></NavLink></div>
        )}
        {reItems.length > 0 && reShown.length > 0 && (
          <div className="nav-group">
            <Branch id="re" label="Real Estate" icon={Building2} open={!!q || !!open.re} onToggle={toggle}>
              {reShown.map(i => <NavLink key={i.to} to={i.to} end className={linkCls}><i.icon size={15} /> <span>{i.label}</span></NavLink>)}
            </Branch>
          </div>
        )}
        {groups.map(gt => {
          const mods = REGISTRY.filter(m => m.group === gt && canM(can, m.key, 'view')).map(m => {
            const pages = m.pages.filter(p => !(p.kind === 'table' && p.entity && m.entities.find(e => e.key === p.entity)?.lookup));
            const all = match(m.label) || match(gt);
            return { m, pages: all ? pages : pages.filter(p => match(p.label)) };
          }).filter(x => x.pages.length > 0);
          if (!mods.length) return null;
          return (
            <div key={gt} className="nav-group">
              <div className="nav-title">{gt}</div>
              {mods.map(({ m, pages }) => (
                <Branch key={m.key} id={m.key} label={m.label} icon={iconFor(m.icon)} open={!!q || !!open[m.key]} onToggle={toggle}>
                  {pages.map(p => <NavLink key={p.key} to={`/m/${m.key}/${p.key}`} end className={linkCls}><span>{p.label}</span></NavLink>)}
                </Branch>
              ))}
            </div>
          );
        })}
        {can('settings', 'view') && match('settings') && (
          <div className="nav-group"><div className="nav-title">Admin</div>
            <NavLink to="/settings" className={linkCls}><SettingsIcon size={17} /> <span>Settings</span></NavLink></div>
        )}
        <div className="nav-group"><NavLink to="/roles" className={linkCls}><Shield size={17} /> <span>All Roles</span></NavLink></div>
      </nav>
      <div className="sidebar-foot">{settings.projectName}</div>
    </aside>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  useEffect(() => { setSearch(''); setOpen(false); }, [loc.pathname]);

  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <Sidebar />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setOpen(o => !o)}><Menu size={20} /></button>
          <div className="search-box">
            <Search size={16} />
            <input placeholder="Search current table..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="user-menu">
            <div className="user-info">
              <strong>{user?.name}</strong>
              <span className={`role-badge role-${user?.role}`}>{user?.role}</span>
            </div>
            <Link to="/roles" className="btn btn-ghost btn-sm switch-role"><Repeat size={15} /> Switch role</Link>
            <button className="btn btn-ghost btn-sm" onClick={logout}><LogOut size={15} /> Logout</button>
          </div>
        </header>
        <main className="content">
          <SearchCtx.Provider value={search}><Outlet /></SearchCtx.Provider>
        </main>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
    </div>
  );
}
