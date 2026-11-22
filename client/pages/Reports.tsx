import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, Card, PageHeader, useToast } from '../components/ui';
import DataTable, { Column } from '../components/DataTable';
import { formatINR } from '../../shared/format';

const REPORTS = [
  { id: 'rent-paid', label: 'Rent Paid' },
  { id: 'vacant-rental', label: 'Vacant Rental Properties' },
  { id: 'rental-units', label: 'Rental Units' },
  { id: 'delinquent-tenants', label: 'Delinquent Tenants' },
  { id: 'leases-ending', label: 'Leases Ending (90 days)' },
  { id: 'vacant-sale', label: 'Vacant Sale Properties' },
  { id: 'sold-units', label: 'Sold Units' },
  { id: 'lead-funnel', label: 'Lead Funnel' },
];
const MONEY = /price|amount|rent|paid|balance|deposit|due|budget|income/i;

interface Result { columns: string[]; rows: any[][] }

export default function Reports() {
  const toast = useToast();
  const [type, setType] = useState(REPORTS[0].id);
  const [data, setData] = useState<Result | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    setData(null);
    setFailed(false);
    api.get<Result>(`/reports/${type}`)
      .then(r => { if (live) setData(r); })
      .catch(e => { if (live) setFailed(true); toast(e instanceof Error ? e.message : 'Failed to load report', 'error'); });
    return () => { live = false; };
  }, [type, tries]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = REPORTS.find(r => r.id === type)!.label;
  const columns: Column<Record<string, any>>[] = (data?.columns ?? []).map((c, i) => ({
    key: `c${i}`,
    label: c,
    render: row => (MONEY.test(c) && typeof row[`c${i}`] === 'number' ? formatINR(row[`c${i}`]) : row[`c${i}`] ?? ''),
    sortValue: row => row[`c${i}`] ?? '',
  }));
  const rows = (data?.rows ?? []).map(r => Object.fromEntries(r.map((v, i) => [`c${i}`, v])));

  return (
    <>
      <PageHeader title="Reports" subtitle="Operational reports across rentals, sales and leads" actions={
        <select aria-label="Report" value={type} onChange={e => setType(e.target.value)}>
          {REPORTS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      } />
      <Card title={label} actions={data && <span className="muted">{data.rows.length} {data.rows.length === 1 ? 'row' : 'rows'}</span>}>
        {failed ? <>Couldn't load data <Button size="sm" onClick={() => setTries(t => t + 1)}>Retry</Button></> : !data ? 'Loading...' : <DataTable columns={columns} rows={rows} exportName={type} emptyMessage="No rows for this report." />}
      </Card>
    </>
  );
}
