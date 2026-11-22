import React, { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api';
import { Button, Card, Empty, PageHeader, StatCard } from '../../components/ui';
import { formatShort } from '../../../shared/format';
import { errMsg } from '../../moduleUtil';

interface Dash { cards: { label: string; value: number; money?: boolean }[]; charts: { title: string; type: 'pie' | 'bar'; data: { name: string; value: number }[] }[] }
const PERIODS = [
  { value: 'all', label: 'All time' }, { value: 'month', label: 'This month' },
  { value: '3m', label: 'Last 3 months' }, { value: 'year', label: 'This year' },
];
const PALETTE = ['#D9BD77', '#3C1300', '#0D6EFD', '#1E9E5A', '#E0A100', '#D64545', '#8A8A8A'];

export default function ModuleDashboard({ moduleKey, title }: { moduleKey: string; title: string }) {
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    api.get<Dash>(`/m/${moduleKey}/dashboard?period=${period}`).then(setData).catch(e => setError(errMsg(e)));
  }, [moduleKey, period]);
  useEffect(() => { setData(null); }, [moduleKey]);
  useEffect(load, [load]);

  const head = (
    <PageHeader title={title} actions={
      <select aria-label="Period" value={period} onChange={e => setPeriod(e.target.value)}>
        {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
    } />
  );
  if (error) return <>{head}<Card title="Could not load dashboard"><p>{error}</p><Button onClick={load}>Retry</Button></Card></>;
  if (!data) return <>{head}<Card>Loading...</Card></>;
  return (
    <>
      {head}
      {data.cards.length === 0 && data.charts.length === 0 && <Card><Empty message="No data for this period." /></Card>}
      <div className="stat-grid">
        {data.cards.map(c => <StatCard key={c.label} label={c.label} value={c.money ? formatShort(c.value) : c.value} />)}
      </div>
      <div className="grid-2">
        {data.charts.map(ch => {
          const rows = ch.data.filter(d => d.value > 0);
          return (
            <Card key={ch.title} title={ch.title}>
              {rows.length === 0 ? <Empty message="No data for this period." /> : (
                <ResponsiveContainer width="100%" height={260}>
                  {ch.type === 'pie' ? (
                    <PieChart>
                      <Pie data={rows} dataKey="value" nameKey="name" outerRadius={85} label={e => e.value}>
                        {rows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip /><Legend />
                    </PieChart>
                  ) : (
                    <BarChart data={ch.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" interval={0} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} />
                      <Tooltip /><Bar dataKey="value" fill="#D9BD77" />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
