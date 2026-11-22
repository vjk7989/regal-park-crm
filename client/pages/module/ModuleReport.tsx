import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api';
import { Button, Card, Empty, PageHeader, useToast } from '../../components/ui';
import DataTable, { Column } from '../../components/DataTable';
import type { ModuleDef } from '../../../shared/registry';
import { formatINR, formatShort } from '../../../shared/format';
import { errMsg } from '../../moduleUtil';

interface Report { columns: string[]; rows: Record<string, any>[] }

export default function ModuleReport({ module, title }: { module: ModuleDef; title: string }) {
  const toast = useToast();
  const entities = useMemo(() => module.entities.filter(e => !e.lookup), [module]);
  const [entity, setEntity] = useState(entities[0]?.key ?? '');
  const ent = entities.find(e => e.key === entity);
  const groupFields = useMemo(() => (ent?.fields ?? []).filter(f => f.type === 'select' || f.type === 'ref' || f.key === ent?.statusField), [ent]);
  const [pick, setGroupBy] = useState('');
  const groupBy = groupFields.find(f => f.key === pick)?.key ?? groupFields[0]?.key ?? '';
  const [report, setReport] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    setReport(null); setFailed(false);
    if (!entity || !groupBy) return;
    let live = true;
    api.get<Report>(`/m/${module.key}/report?entity=${entity}&groupBy=${groupBy}`)
      .then(r => { if (live) setReport(r); }).catch(e => { if (live) { setFailed(true); toast(errMsg(e), 'error'); } });
    return () => { live = false; };
  }, [module.key, entity, groupBy, tries]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasAmount = !!report?.columns.includes('Amount');
  const columns: Column<Record<string, any>>[] = (report?.columns ?? []).map(c => ({
    key: c, label: c, ...(c === 'Amount' ? { render: (r: Record<string, any>) => formatINR(Number(r[c] ?? 0)), sortValue: (r: Record<string, any>) => Number(r[c] ?? 0) } : {}),
  }));
  const labelKey = report?.columns[0];
  const chart = report && labelKey ? report.rows.map(r => ({ name: String(r[labelKey]), Count: Number(r.Count ?? 0), Amount: Number(r.Amount ?? 0) })) : [];

  return (
    <>
      <PageHeader title={title} actions={
        <>
          <select aria-label="Entity" value={entity} onChange={e => setEntity(e.target.value)}>
            {entities.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>{' '}
          <select aria-label="Group by" value={groupBy} onChange={e => setGroupBy(e.target.value)}>
            {groupFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </>
      } />
      {failed && <Card title="Couldn't load report"><Button onClick={() => setTries(t => t + 1)}>Retry</Button></Card>}
      {!groupBy ? <Card><Empty message="This entity has nothing to group by." /></Card> : (
        <>
          {chart.length > 0 && (
            <Card title="Chart">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" interval={0} tick={{ fontSize: 11 }} /><YAxis yAxisId="l" allowDecimals={false} />{hasAmount && <YAxis yAxisId="r" orientation="right" tickFormatter={v => formatShort(Number(v))} />}
                  <Tooltip formatter={(v, n) => (n === 'Amount' ? formatINR(Number(v)) : v)} /><Bar yAxisId="l" dataKey="Count" fill="#D9BD77" />{hasAmount && <Bar yAxisId="r" dataKey="Amount" fill="#3C1300" />}
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
          <DataTable columns={columns} rows={report?.rows ?? []} exportName={`${module.key}-${entity}-report`} emptyMessage={report ? 'No data.' : failed ? 'Could not load report.' : 'Loading...'} />
        </>
      )}
    </>
  );
}
