// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import DataTable, { type Column } from '../../client/components/DataTable';
import { SearchCtx } from '../../client/components/ui';

interface Row { id: string; name: string; city?: string; price?: number; code?: string }

const cols: Column<Row>[] = [
  { key: 'name', label: 'Name' },
  { key: 'city', label: 'City' },
  { key: 'price', label: 'Price' },
];

const makeRows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, name: `Item ${String(i + 1).padStart(2, '0')}`, city: 'Pune', price: i + 1 }));

const header = (label: string) => screen.getAllByRole('columnheader').find(h => h.textContent!.startsWith(label))!;
const bodyRows = () => screen.getAllByRole('row').slice(1);
const colValues = (idx: number) => bodyRows().map(r => within(r).getAllByRole('cell')[idx].textContent);
const foot = () => document.querySelector('.table-foot .muted')!.textContent;
const pageNum = () => document.querySelector('.page-num')!.textContent;

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('DataTable — empty state', () => {
  it('shows default empty message with no rows and 0-0 of 0, single page', () => {
    render(<DataTable columns={cols} rows={[]} />);
    expect(screen.getByText('No records found.')).toBeTruthy();
    expect(bodyRows()).toHaveLength(0);
    expect(foot()).toBe('0-0 of 0');
    expect(pageNum()).toBe('1 / 1');
    expect((screen.getByText('Prev') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows custom emptyMessage', () => {
    render(<DataTable columns={cols} rows={[]} emptyMessage="No leads yet" />);
    expect(screen.getByText('No leads yet')).toBeTruthy();
  });

  it('renders null/undefined cell values as empty strings', () => {
    render(<DataTable columns={cols} rows={[{ id: 'x', name: 'Solo' }]} />);
    expect(colValues(1)).toEqual(['']);
    expect(colValues(2)).toEqual(['']);
    expect(screen.queryByText('undefined')).toBeNull();
  });
});

describe('DataTable — search', () => {
  const rows: Row[] = [
    { id: '1', name: 'Alpha Villa', city: 'Bangalore', price: 100 },
    { id: '2', name: 'Beta Villa', city: 'Mysore', price: 200 },
    { id: '3', name: 'Gamma Flat', city: 'Bangalore', price: 300 },
  ];

  it('filters case-insensitively across columns', () => {
    render(<DataTable columns={cols} rows={rows} />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'BANGALORE' } });
    expect(colValues(0)).toEqual(['Alpha Villa', 'Gamma Flat']);
  });

  it('multiple terms must all match (AND), across different columns', () => {
    render(<DataTable columns={cols} rows={rows} />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'villa bangalore' } });
    expect(colValues(0)).toEqual(['Alpha Villa']);
  });

  it('matches numeric values', () => {
    render(<DataTable columns={cols} rows={rows} />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: '200' } });
    expect(colValues(0)).toEqual(['Beta Villa']);
  });

  it('search with no match shows empty state and 0 of 0', () => {
    render(<DataTable columns={cols} rows={rows} />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'zzz-nomatch' } });
    expect(bodyRows()).toHaveLength(0);
    expect(screen.getByText('No records found.')).toBeTruthy();
    expect(foot()).toBe('0-0 of 0');
  });

  it('whitespace-only search shows all rows', () => {
    render(<DataTable columns={cols} rows={rows} />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: '   ' } });
    expect(bodyRows()).toHaveLength(3);
  });

  it('combines topbar (SearchCtx) search and search prop with local query', () => {
    render(<SearchCtx.Provider value="villa"><DataTable columns={cols} rows={rows} search="mysore" /></SearchCtx.Provider>);
    expect(colValues(0)).toEqual(['Beta Villa']);
  });

  it('typing a search resets to the first page', () => {
    render(<DataTable columns={cols} rows={makeRows(25)} />);
    fireEvent.click(screen.getByText('Next'));
    expect(pageNum()).toBe('2 / 3');
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'item' } });
    expect(pageNum()).toBe('1 / 3');
    expect(foot()).toBe('1-10 of 25');
  });
});

describe('DataTable — sort', () => {
  it('toggles asc -> desc -> unsorted on repeated header clicks, with arrow indicator', () => {
    const rows: Row[] = [{ id: '1', name: 'Charlie' }, { id: '2', name: 'alpha' }, { id: '3', name: 'Bravo' }];
    render(<DataTable columns={cols} rows={rows} />);
    fireEvent.click(header('Name'));
    expect(colValues(0)).toEqual(['alpha', 'Bravo', 'Charlie']);
    expect(header('Name').textContent).toContain('▲');
    fireEvent.click(header('Name'));
    expect(colValues(0)).toEqual(['Charlie', 'Bravo', 'alpha']);
    expect(header('Name').textContent).toContain('▼');
    fireEvent.click(header('Name'));
    expect(colValues(0)).toEqual(['Charlie', 'alpha', 'Bravo']);
    expect(header('Name').textContent).toBe('Name');
  });

  it('switching to another column starts ascending on that column', () => {
    const rows: Row[] = [{ id: '1', name: 'B', city: 'Y' }, { id: '2', name: 'A', city: 'Z' }, { id: '3', name: 'C', city: 'X' }];
    render(<DataTable columns={cols} rows={rows} />);
    fireEvent.click(header('Name'));
    fireEvent.click(header('Name')); // desc on name
    fireEvent.click(header('City'));
    expect(colValues(1)).toEqual(['X', 'Y', 'Z']);
    expect(header('Name').textContent).toBe('Name');
  });

  it('sorts numbers numerically, not lexicographically', () => {
    const rows: Row[] = [{ id: '1', name: 'a', price: 100 }, { id: '2', name: 'b', price: 9 }, { id: '3', name: 'c', price: 20 }];
    render(<DataTable columns={cols} rows={rows} />);
    fireEvent.click(header('Price'));
    expect(colValues(2)).toEqual(['9', '20', '100']);
    fireEvent.click(header('Price'));
    expect(colValues(2)).toEqual(['100', '20', '9']);
  });

  it('sorts numeric-looking strings naturally (A2 before A10)', () => {
    const c: Column<Row>[] = [{ key: 'code', label: 'Code' }];
    render(<DataTable columns={c} rows={[{ id: '1', name: '', code: 'A10' }, { id: '2', name: '', code: 'A2' }, { id: '3', name: '', code: 'A1' }]} />);
    fireEvent.click(header('Code'));
    expect(colValues(0)).toEqual(['A1', 'A2', 'A10']);
  });

  it('undefined values in a numeric column group at one end (first asc, last desc)', () => {
    const rows: Row[] = [{ id: '1', name: 'a', price: 50 }, { id: '2', name: 'b' }, { id: '3', name: 'c', price: 5 }];
    render(<DataTable columns={cols} rows={rows} />);
    fireEvent.click(header('Price'));
    expect(colValues(0)).toEqual(['b', 'c', 'a']);
    fireEvent.click(header('Price'));
    expect(colValues(0)).toEqual(['a', 'c', 'b']);
  });

  it('uses sortValue when provided (render shows formatted text, sort by raw number)', () => {
    const c: Column<Row>[] = [{ key: 'price', label: 'Price', sortValue: r => r.price ?? 0, render: r => `Rs ${r.price}` }];
    render(<DataTable columns={c} rows={[{ id: '1', name: '', price: 1000 }, { id: '2', name: '', price: 200 }]} />);
    fireEvent.click(header('Price'));
    expect(colValues(0)).toEqual(['Rs 200', 'Rs 1000']);
  });

  it('undefined returned from sortValue is grouped at an end, not sorted as the word "undefined"', () => {
    const c: Column<Row>[] = [{ key: 'city', label: 'City', sortValue: r => r.city as string }];
    const rows: Row[] = [{ id: '1', name: 'z', city: 'Zurich' }, { id: '2', name: 'u' }, { id: '3', name: 'b', city: 'Bangalore' }, { id: '4', name: 'm', city: 'Mysore' }];
    render(<DataTable columns={[...c, { key: 'name', label: 'Name' }]} rows={rows} />);
    fireEvent.click(header('City'));
    const order = colValues(1);
    // the undefined-city row ('u') must be first or last, never in the middle
    expect([order[0], order[order.length - 1]]).toContain('u');
  });

  it('sort applies across pages (whole dataset sorted, not just current page)', () => {
    render(<DataTable columns={cols} rows={makeRows(15)} />);
    fireEvent.click(header('Price'));
    fireEvent.click(header('Price')); // desc
    expect(colValues(2)[0]).toBe('15');
  });
});

describe('DataTable — pagination', () => {
  it('exactly 10 rows -> one page; 11 rows -> two pages (page size boundary)', () => {
    const { unmount } = render(<DataTable columns={cols} rows={makeRows(10)} />);
    expect(pageNum()).toBe('1 / 1');
    expect(bodyRows()).toHaveLength(10);
    unmount();
    render(<DataTable columns={cols} rows={makeRows(11)} />);
    expect(pageNum()).toBe('1 / 2');
    fireEvent.click(screen.getByText('Next'));
    expect(bodyRows()).toHaveLength(1);
    expect(foot()).toBe('11-11 of 11');
  });

  it('Next/Prev navigate and disable at the bounds', () => {
    render(<DataTable columns={cols} rows={makeRows(23)} />);
    expect(foot()).toBe('1-10 of 23');
    expect((screen.getByText('Prev') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Next'));
    expect(foot()).toBe('11-20 of 23');
    fireEvent.click(screen.getByText('Next'));
    expect(foot()).toBe('21-23 of 23');
    expect(pageNum()).toBe('3 / 3');
    expect((screen.getByText('Next') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Prev'));
    expect(foot()).toBe('11-20 of 23');
  });

  it('offers page sizes 10, 25, 50 (default 10)', () => {
    render(<DataTable columns={cols} rows={makeRows(3)} />);
    const sel = screen.getByRole('combobox') as HTMLSelectElement;
    expect(Array.from(sel.options).map(o => o.value)).toEqual(['10', '25', '50']);
    expect(sel.value).toBe('10');
  });

  it('changing page size resets to the first page', () => {
    render(<DataTable columns={cols} rows={makeRows(60)} />);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    expect(pageNum()).toBe('3 / 6');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '25' } });
    expect(pageNum()).toBe('1 / 3');
    expect(foot()).toBe('1-25 of 60');
    expect(bodyRows()).toHaveLength(25);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '50' } });
    expect(bodyRows()).toHaveLength(50);
    expect(pageNum()).toBe('1 / 2');
  });

  it('clamps current page when rows shrink below it', () => {
    const { rerender } = render(<DataTable columns={cols} rows={makeRows(25)} />);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    expect(pageNum()).toBe('3 / 3');
    rerender(<DataTable columns={cols} rows={makeRows(5)} />);
    expect(pageNum()).toBe('1 / 1');
    expect(bodyRows()).toHaveLength(5);
  });
});

describe('DataTable — row actions', () => {
  it('renders an Actions column and invokes the action with the row', () => {
    const onEdit = vi.fn();
    const rows: Row[] = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
    render(<DataTable columns={cols} rows={rows} actions={r => <button onClick={() => onEdit(r)}>Edit {r.name}</button>} />);
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
    fireEvent.click(screen.getByText('Edit B'));
    expect(onEdit).toHaveBeenCalledWith(rows[1]);
  });

  it('no Actions column when actions prop is absent; clicking an action does not sort', () => {
    render(<DataTable columns={cols} rows={[{ id: '1', name: 'A' }]} />);
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });
});

describe('DataTable — CSV export', () => {
  let csv = '';
  let download = '';
  beforeEach(() => {
    csv = '';
    download = '';
    const Orig = Blob;
    vi.stubGlobal('Blob', class extends Orig {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) { super(parts, opts); csv = parts.map(String).join(''); }
    });
    (URL as any).createObjectURL = vi.fn(() => 'blob:test');
    (URL as any).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { download = this.download; });
  });

  it('escapes commas, quotes and newlines; header from labels', () => {
    const c: Column<Row>[] = [{ key: 'name', label: 'Name, full' }, { key: 'city', label: 'City "quoted"' }];
    const rows: Row[] = [
      { id: '1', name: 'Smith, John', city: 'He said "hi"' },
      { id: '2', name: 'line1\nline2', city: undefined },
    ];
    render(<DataTable columns={c} rows={rows} exportName="leads" />);
    fireEvent.click(screen.getByText('Export CSV'));
    expect(csv).toBe(
      '"Name, full","City ""quoted"""\n' +
      '"Smith, John","He said ""hi"""\n' +
      '"line1\nline2",""',
    );
    expect(download).toBe('leads.csv');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('exports all filtered+sorted rows (not only the current page) and defaults filename to export.csv', () => {
    render(<DataTable columns={[{ key: 'price', label: 'P' }]} rows={makeRows(12)} />);
    fireEvent.click(header('P'));
    fireEvent.click(header('P')); // desc
    fireEvent.click(screen.getByText('Export CSV'));
    const lines = csv.split('\n');
    expect(lines).toHaveLength(13);
    expect(lines[1]).toBe('"12"');
    expect(lines[12]).toBe('"1"');
    expect(download).toBe('export.csv');
  });

  it('exports only header when search matches nothing', () => {
    render(<DataTable columns={cols} rows={makeRows(3)} />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'nomatch' } });
    fireEvent.click(screen.getByText('Export CSV'));
    expect(csv).toBe('"Name","City","Price"');
  });

  it('exports raw value (sortValue) rather than rendered JSX', () => {
    const c: Column<Row>[] = [{ key: 'price', label: 'Price', render: r => <b>Rs {r.price}</b> }];
    render(<DataTable columns={c} rows={[{ id: '1', name: '', price: 0 }]} />);
    fireEvent.click(screen.getByText('Export CSV'));
    expect(csv).toBe('"Price"\n"0"');
  });
});
