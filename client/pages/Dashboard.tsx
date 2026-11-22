import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { BRANDING, useAuth } from '../auth';
import { Button, Card, Empty, PageHeader, StatCard, StatusBadge, useToast } from '../components/ui';
import DataTable, { Column } from '../components/DataTable';
import { formatDate, formatShort } from '../../shared/format';

type Point = { name: string; value: number };
interface Dash {
  saleIncome: number; rentalIncome: number; forSale: number; sold: number; selling: number; forLease: number; rented: number; available: number;
  propertyByStatus: Point[]; buyByStatus: Point[]; rentByStatus: Point[]; topCities: Point[]; leadsByStatus: Point[]; leadsBySource: Point[];
  recentLeads: any[]; leadsThisMonth: number; siteVisitsScheduled: number;
}

const PERIODS = [
  { value: 'all', label: 'All time' }, { value: 'month', label: 'This month' },
  { value: '3m', label: 'Last 3 months' }, { value: 'year', label: 'This year' },
];
const PALETTE = ['#D9BD77', '#3C1300', '#0D6EFD', '#1E9E5A', '#E0A100', '#D64545', '#8A8A8A'];

function PieCard({ title, data }: { title: string; data: Point[] }) {
  const rows = data.filter(d => d.value > 0);
  return (
    <Card title={title}>
      {rows.length === 0 ? <Empty message="No data for this period." /> : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" outerRadius={85} label={e => e.value}>
              {rows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip /><Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function BarCard({ title, data, color, vertical }: { title: string; data: Point[]; color: string; vertical?: boolean }) {
  return (
    <Card title={title}>
      {data.every(d => d.value === 0) ? <Empty message="No data for this period." /> : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} layout={vertical ? 'vertical' : 'horizontal'} margin={{ left: vertical ? 40 : 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            {vertical ? <XAxis type="number" allowDecimals={false} /> : <XAxis dataKey="name" interval={0} tick={{ fontSize: 11 }} />}
            {vertical ? <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} /> : <YAxis allowDecimals={false} />}
            <Tooltip />
            <Bar dataKey="value" fill={color} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const toast = useToast();
  const { can } = useAuth();
  const seeLeads = can('leads', 'view');
  const [params, setParams] = useSearchParams();
  const period = params.get('period') ?? 'all';
  const [d, setD] = useState<Dash | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    api.get<Dash>(`/dashboard?period=${encodeURIComponent(period)}`)
      .then(r => { if (live) setD(r); })
      .catch(e => { if (live) setFailed(true); toast(e instanceof Error ? e.message : 'Failed to load dashboard', 'error'); });
    return () => { live = false; };
  }, [period, tries]); // eslint-disable-line react-hooks/exhaustive-deps

  const leadCols: Column<any>[] = [
    { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'source', label: 'Source' }, { key: 'interest', label: 'Interest' },
    { key: 'status', label: 'Status', render: l => <StatusBadge status={l.status} /> },
    { key: 'createdAt', label: 'Date', render: l => formatDate(l.createdAt), sortValue: l => l.createdAt },
  ];

  return (
    <>
      <div style={{ background: "linear-gradient(135deg, #3C1300, #8a5a2b)", color: "#D9BD77", borderRadius: 10, padding: "18px 22px", marginBottom: 18 }}>
        <h1 style={{ color: "#D9BD77", margin: 0 }}>{BRANDING.projectName}</h1>
        <p style={{ margin: "4px 0 0", color: "#FFF8E7" }}>{BRANDING.tagline}</p>
      </div>
      <PageHeader title="Dashboard" actions={
        <select aria-label="Period" value={period} onChange={e => setParams(e.target.value === 'all' ? {} : { period: e.target.value })}>
          {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      } />
      {failed ? <Card>Couldn't load data <Button size="sm" onClick={() => setTries(t => t + 1)}>Retry</Button></Card> : !d ? <Card>Loading...</Card> : (
        <>
          <div className="stat-grid">
            <StatCard label="Sale income" value={formatShort(d.saleIncome)} />
            <StatCard label="For sale" value={d.forSale} />
            <StatCard label="Sold" value={d.sold} />
            <StatCard label="Selling" value={d.selling} />
            <StatCard label="Rental income" value={formatShort(d.rentalIncome)} />
            <StatCard label="For lease" value={d.forLease} />
            <StatCard label="Rented" value={d.rented} />
            <StatCard label="Available" value={d.available} />
            {seeLeads && <>
            <StatCard label="Leads this month" value={d.leadsThisMonth} />
            <StatCard label="Site visits scheduled" value={d.siteVisitsScheduled} />
            </>}
          </div>
          <div className="grid-2">
            <PieCard title="Property status" data={d.propertyByStatus} />
            <PieCard title="Buy requests by status" data={d.buyByStatus} />
            <PieCard title="Rent requests by status" data={d.rentByStatus} />
            <BarCard title="Top cities" data={d.topCities} color="#3C1300" />
            {seeLeads && <>
            <BarCard title="Leads by source" data={d.leadsBySource} color="#0D6EFD" vertical />
            <BarCard title="Leads funnel" data={d.leadsByStatus} color="#D9BD77" vertical />
            </>}
          </div>
          {seeLeads && (
          <Card title="Recent leads">
            <DataTable columns={leadCols} rows={d.recentLeads} exportName="recent-leads" emptyMessage="No leads in this period." />
          </Card>
          )}
        </>
      )}
    </>
  );
}
