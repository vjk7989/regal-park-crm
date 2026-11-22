import React, { useContext, useMemo, useState } from 'react';
import { Empty, SearchCtx } from './ui';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  width?: string;
}

function cellText<T>(c: Column<T>, row: T): string {
  const raw = c.sortValue ? c.sortValue(row) : (row as any)[c.key];
  return raw == null ? '' : String(raw);
}

export default function DataTable<T extends { id?: string }>({ columns, rows, actions, search = '', exportName, emptyMessage }: {
  columns: Column<T>[]; rows: T[]; actions?: (row: T) => React.ReactNode; search?: string; exportName?: string; emptyMessage?: string;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);

  const global = useContext(SearchCtx);
  const q = `${global} ${search} ${query}`.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return rows;
    const terms = q.split(/\s+/);
    return rows.filter(r => {
      const hay = columns.map(c => cellText(c, r)).join(' ').toLowerCase();
      return terms.every(t => hay.includes(t));
    });
  }, [rows, columns, q]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return filtered;
    const val = (r: T): string | number => ((col.sortValue ? col.sortValue(r) : (r as any)[col.key]) ?? '');
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir;
    });
  }, [filtered, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = sorted.slice(cur * pageSize, cur * pageSize + pageSize);

  const toggleSort = (key: string) => setSort(s => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));

  const exportCsv = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [columns.map(c => esc(c.label)).join(','), ...sorted.map(r => columns.map(c => esc(cellText(c, r))).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${exportName ?? 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="table-wrap">
      <div className="table-toolbar">
        <input className="table-search" placeholder="Search..." value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} />
        <div className="table-tools">
          <label>Show{' '}
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}>
              {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c.key} style={c.width ? { width: c.width } : undefined} className="sortable" onClick={() => toggleSort(c.key)}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              {actions && <th className="actions-col">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={r.id ?? i}>
                {columns.map(c => <td key={c.key}>{c.render ? c.render(r) : cellText(c, r)}</td>)}
                {actions && <td className="actions-col">{actions(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {slice.length === 0 && <Empty message={emptyMessage ?? 'No records found.'} />}
      </div>
      <div className="table-foot">
        <span className="muted">{sorted.length === 0 ? 0 : cur * pageSize + 1}-{Math.min(sorted.length, (cur + 1) * pageSize)} of {sorted.length}</span>
        <div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Prev</button>
          <span className="page-num">{cur + 1} / {pages}</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
