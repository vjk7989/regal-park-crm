import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Module } from '../shared/types';
import { useAuth } from './auth';
import Layout from './Layout';
import { Card } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import PropertyForm from './pages/PropertyForm';
import PropertyDetail from './pages/PropertyDetail';
import Approvals from './pages/Approvals';
import Leads from './pages/Leads';
import EntityPage from './pages/EntityPage';
import Requests from './pages/Requests';
import RequestDetail from './pages/RequestDetail';
import Tenants from './pages/Tenants';
import Invoices, { Contracts } from './pages/Billing';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

function Guard({ module, alt, children }: { module: Module; alt?: Module; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(module, 'view') && !(alt && can(alt, 'view'))) return <Card title="Access denied">You do not have permission to view this page.</Card>;
  return <>{children}</>;
}

const g = (module: Module, el: React.ReactNode) => <Guard module={module}>{el}</Guard>;

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash">Loading...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
        <Route path="/" element={g('dashboard', <Dashboard />)} />
        <Route path="/properties" element={g('properties', <Properties />)} />
        <Route path="/properties/new" element={g('properties', <PropertyForm />)} />
        <Route path="/properties/:id/edit" element={g('properties', <PropertyForm />)} />
        <Route path="/properties/:id" element={g('properties', <PropertyDetail />)} />
        <Route path="/approvals" element={g('approvals', <Approvals />)} />
        <Route path="/leads" element={g('leads', <Leads />)} />
        <Route path="/owners" element={g('owners', <EntityPage entity="owners" />)} />
        <Route path="/staff" element={g('staff', <EntityPage entity="staff" />)} />
        <Route path="/agents" element={g('agents', <EntityPage entity="agents" />)} />
        <Route path="/brokers" element={g('brokers', <EntityPage entity="brokers" />)} />
        <Route path="/clients" element={g('clients', <EntityPage entity="clients" />)} />
        <Route path="/buy-requests" element={g('buyRequests', <Requests kind="buy" />)} />
        <Route path="/rent-requests" element={g('rentRequests', <Requests kind="rent" />)} />
        <Route path="/requests/:id" element={<Guard module="buyRequests" alt="rentRequests"><RequestDetail /></Guard>} />
        <Route path="/tenants" element={g('tenants', <Tenants />)} />
        <Route path="/invoices" element={g('invoices', <Invoices />)} />
        <Route path="/contracts" element={g('contracts', <Contracts />)} />
        <Route path="/reports" element={g('reports', <Reports />)} />
        <Route path="/settings" element={g('settings', <Settings />)} />
        <Route path="*" element={<Card title="Not found">This page does not exist.</Card>} />
      </Route>
    </Routes>
  );
}
