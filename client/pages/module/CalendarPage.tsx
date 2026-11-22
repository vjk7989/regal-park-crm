import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../api';
import { Button, PageHeader, useToast } from '../../components/ui';
import { moduleByKey, type ModuleDef } from '../../../shared/registry';
import { errMsg } from '../../moduleUtil';

interface Ev { id: string; title: string; date: string; module: string; entity: string }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Month grid of /calendar. `module` filters to one module; omit for all modules (Utilities). */
export default function CalendarPage({ module, title = 'Calendar' }: { module?: ModuleDef; title?: string }) {
  const toast = useToast();
  const nav = useNavigate();
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [events, setEvents] = useState<Ev[]>([]);
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - cursor.getDay());
  const cells = useMemo(() => Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i)), [cursor]); // eslint-disable-line react-hooks/exhaustive-deps
  const from = ymd(cells[0]);
  const to = ymd(cells[41]);

  useEffect(() => {
    let live = true;
    api.get<Ev[]>(`/calendar?from=${from}&to=${to}`)
      .then(r => { if (live) setEvents(r); }).catch(e => { if (live) { setEvents([]); toast(errMsg(e), 'error'); } });
    return () => { live = false; };
  }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = module ? events.filter(e => e.module === module.key) : events;
  const byDay = new Map<string, Ev[]>();
  for (const e of shown) { const k = e.date.slice(0, 10); byDay.set(k, [...(byDay.get(k) ?? []), e]); }
  const today = ymd(new Date());

  const open = (e: Ev) => {
    const m = moduleByKey(e.module);
    const page = m?.pages.find(p => p.kind === 'table' && p.entity === e.entity);
    nav(m ? `/m/${m.key}${page ? `/${page.key}` : ''}` : '/');
  };
  const step = (n: number) => setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1));

  return (
    <>
      <PageHeader title={title} subtitle={`${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`} actions={
        <>
          <Button size="sm" variant="ghost" aria-label="Previous month" onClick={() => step(-1)}><ChevronLeft size={16} /></Button>{' '}
          <Button size="sm" variant="ghost" onClick={() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); }}>Today</Button>{' '}
          <Button size="sm" variant="ghost" aria-label="Next month" onClick={() => step(1)}><ChevronRight size={16} /></Button>
        </>
      } />
      <div className="cal-grid">
        {DAYS.map(d => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map(d => {
          const k = ymd(d);
          const evs = byDay.get(k) ?? [];
          return (
            <div key={k} className={`cal-cell ${d.getMonth() !== cursor.getMonth() ? 'off' : ''} ${k === today ? 'today' : ''}`}>
              <div className="cal-day">{d.getDate()}</div>
              {evs.slice(0, 3).map(e => <button key={e.id} type="button" className="cal-event" title={e.title} onClick={() => open(e)}>{e.title}</button>)}
              {evs.length > 3 && <div className="muted cal-more">+{evs.length - 3} more</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
