import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { api } from '../api';
import { BRANDING } from '../auth';
import { Button, Card, Empty, PageHeader, StatusBadge } from '../components/ui';
import { formatDate, formatINR } from '../../shared/format';
import { REGISTRY } from '../../shared/registry';

type Point = { name: string; value: number };
type Row = { status: string; count: number; percent: number };
interface Data {
  bars: { label: string; value: number; total: number }[];
  invoiceOverview: Row[]; estimateOverview: Row[]; proposalOverview: Row[];
  totals: { outstanding: number; pastDue: number; paid: number };
  leadsByStatus: Point[]; projectsByStatus: Point[];
  myTasks: { id: string; name: string; status: string; dueDate?: string; priority?: string; mine: boolean }[];
  upcoming: { id: string; title: string; date: string; module: string; entity: string }[];
}

const PALETTE = ['#D9BD77', '#3C1300', '#0D6EFD', '#1E9E5A', '#E0A100', '#D64545', '#8A8A8A'];
const TRACK = '#efe6d2';

function Bar({ pct, color = '#D9BD77' }: { pct: number; color?: string }) {
  return <div style={{ background: TRACK, borderRadius: 4, height: 6, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color }} /></div>;
}

function Tile({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div className="stat-label">{label}</div>
        <div style={{ fontWeight: 700, color: '#3C1300', whiteSpace: 'nowrap' }}>{value} / {total}</div>
      </div>
      <div style={{ margin: '10px 0 4px' }}><Bar pct={pct} color="#3C1300" /></div>
      <div className="stat-hint">{pct}%</div>
    </div>
  );
}

function StatusCol({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div style={{ flex: '1 1 220px', minWidth: 200 }}>
      <h4 style={{ margin: '0 0 10px', color: '#3C1300' }}>{title}</h4>
      {rows.length === 0 ? <Empty message="No data." /> : rows.map(r => (
        <div key={r.status} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{r.status}</span><span>{r.count} ({r.percent}%)</span></div>
          <Bar pct={r.percent} />
        </div>
      ))}
    </div>
  );
}

function Donut({ title, data }: { title: string; data: Point[] }) {
  const rows = data.filter(d => d.value > 0);
  return (
    <Card title={title}>
      {rows.length === 0 ? <Empty message="No data yet." /> : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} label={e => e.value}>
              {rows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip /><Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

/** Link to the first table page of the module that shows this entity. */
function pageLink(module: string, entity: string): string {
  const page = REGISTRY.find(m => m.key === module)?.pages.find(p => p.entity === entity);
  return page ? `/m/${module}/${page.key}` : `/m/${module}`;
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? v : []);
/** Defaults every field so a partial response cannot crash rendering; a non-object response is an error. */
function normalize(r: unknown): Data {
  if (typeof r !== 'object' || r === null || Array.isArray(r)) throw new Error('Malformed overview');
  const o = r as Partial<Data>, t: Partial<Data['totals']> = o.totals ?? {};
  return {
    bars: arr(o.bars), invoiceOverview: arr(o.invoiceOverview), estimateOverview: arr(o.estimateOverview), proposalOverview: arr(o.proposalOverview),
    totals: { outstanding: Number(t.outstanding) || 0, pastDue: Number(t.pastDue) || 0, paid: Number(t.paid) || 0 },
    leadsByStatus: arr(o.leadsByStatus), projectsByStatus: arr(o.projectsByStatus), myTasks: arr(o.myTasks), upcoming: arr(o.upcoming),
  };
}

const rowStyle = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: `1px solid ${TRACK}` } as const;

export default function Overview() {
  const [d, setD] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    api.get<Partial<Data>>('/overview').then(r => { if (live) setD(normalize(r)); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [tries]);

  return (
    <>
      <div style={{ background: 'linear-gradient(135deg, #3C1300, #8a5a2b)', color: '#D9BD77', borderRadius: 10, padding: '18px 22px', marginBottom: 18 }}>
        <h1 style={{ color: '#D9BD77', margin: 0 }}>{BRANDING.projectName}</h1>
        <p style={{ margin: '4px 0 0', color: '#FFF8E7' }}>{BRANDING.tagline}</p>
      </div>
      <PageHeader title="Dashboard" actions={<Link to="/real-estate">Real Estate dashboard</Link>} />
      {failed ? <Card>Could not load data <Button size="sm" onClick={() => setTries(t => t + 1)}>Retry</Button></Card> : !d ? <Card>Loading...</Card> : (
        <>
          <div className="stat-grid">{d.bars.map(b => <Tile key={b.label} {...b} />)}</div>
          <Card title="Sales overview">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              <StatusCol title="Invoice overview" rows={d.invoiceOverview} />
              <StatusCol title="Estimate overview" rows={d.estimateOverview} />
              <StatusCol title="Proposal overview" rows={d.proposalOverview} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${TRACK}` }}>
              <div><div className="stat-label">Outstanding invoices</div><strong>{formatINR(d.totals.outstanding)}</strong></div>
              <div><div className="stat-label">Past due invoices</div><strong style={{ color: '#D64545' }}>{formatINR(d.totals.pastDue)}</strong></div>
              <div><div className="stat-label">Paid invoices</div><strong style={{ color: '#1E9E5A' }}>{formatINR(d.totals.paid)}</strong></div>
            </div>
          </Card>
          <div className="grid-2">
            <Donut title="Leads overview" data={d.leadsByStatus} />
            <Donut title="Projects" data={d.projectsByStatus} />
            <Card title="My tasks" actions={<Link to="/m/tasks">View all</Link>}>
              {d.myTasks.length === 0 ? <Empty message="No open tasks." /> : d.myTasks.map(t => (
                <div key={t.id} style={rowStyle}>
                  <Link to="/m/tasks">{t.name}</Link>
                  <span style={{ whiteSpace: 'nowrap' }}>{t.dueDate && <small>{formatDate(t.dueDate)} </small>}<StatusBadge status={t.status} /></span>
                </div>
              ))}
            </Card>
            <Card title="Upcoming">
              {d.upcoming.length === 0 ? <Empty message="Nothing upcoming." /> : d.upcoming.map(u => (
                <div key={`${u.entity}-${u.id}`} style={rowStyle}>
                  <Link to={pageLink(u.module, u.entity)}>{u.title}</Link>
                  <small style={{ whiteSpace: 'nowrap' }}>{formatDate(u.date)}</small>
                </div>
              ))}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
