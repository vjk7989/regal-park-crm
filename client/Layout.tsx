import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Building2, CheckSquare, KeyRound, ShoppingCart, UserCheck, FileText, Receipt, FileSignature,
  UserCog, Briefcase, Handshake, UsersRound, BarChart3, Settings as SettingsIcon, LogOut, Menu, Search, Shield, Repeat, type LucideIcon,
} from 'lucide-react';
import type { Module } from '../shared/types';
import { useAuth } from './auth';
import { SearchCtx } from './components/ui';

interface NavItem { to: string; label: string; module: Module; icon: LucideIcon }
const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: 'Overview', items: [{ to: '/', label: 'Dashboard', module: 'dashboard', icon: LayoutDashboard }] },
  { title: 'Sales', items: [
    { to: '/leads', label: 'Leads', module: 'leads', icon: Users },
    { to: '/properties', label: 'Properties', module: 'properties', icon: Building2 },
    { to: '/approvals', label: 'Approvals', module: 'approvals', icon: CheckSquare },
    { to: '/buy-requests', label: 'Buy Requests', module: 'buyRequests', icon: ShoppingCart },
    { to: '/rent-requests', label: 'Rental Requests', module: 'rentRequests', icon: KeyRound },
  ] },
  { title: 'Rentals & Billing', items: [
    { to: '/tenants', label: 'Tenants', module: 'tenants', icon: UserCheck },
    { to: '/invoices', label: 'Invoices', module: 'invoices', icon: Receipt },
    { to: '/contracts', label: 'Contracts', module: 'contracts', icon: FileSignature },
  ] },
  { title: 'People', items: [
    { to: '/owners', label: 'Property Owners', module: 'owners', icon: FileText },
    { to: '/staff', label: 'My Staff', module: 'staff', icon: UserCog },
    { to: '/agents', label: 'Real Estate Agents', module: 'agents', icon: Briefcase },
    { to: '/brokers', label: 'Business Brokers', module: 'brokers', icon: Handshake },
    { to: '/clients', label: 'Clients', module: 'clients', icon: UsersRound },
  ] },
  { title: 'Insights', items: [{ to: '/reports', label: 'Reports', module: 'reports', icon: BarChart3 }] },
  { title: 'Admin', items: [{ to: '/settings', label: 'Settings', module: 'settings', icon: SettingsIcon }] },
];

export default function Layout() {
  const { user, can, logout, settings } = useAuth();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  useEffect(() => { setSearch(''); setOpen(false); }, [loc.pathname]);

  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-main">REGAL PARK</div>
          <div className="logo-sub">by Sterlitee</div>
        </div>
        <nav>
          {GROUPS.map(g => {
            const items = g.items.filter(i => can(i.module, 'view'));
            if (!items.length) return null;
            return (
              <div key={g.title} className="nav-group">
                <div className="nav-title">{g.title}</div>
                {items.map(i => (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <i.icon size={17} /> <span>{i.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
          <div className="nav-group"><NavLink to="/roles" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Shield size={17} /> <span>All Roles</span></NavLink></div>
        </nav>
        <div className="sidebar-foot">{settings.projectName}</div>
      </aside>
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
