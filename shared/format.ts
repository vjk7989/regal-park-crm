const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function group(n: number): string {
  const s = String(Math.round(Math.abs(n)));
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

export function formatINR(n: number | undefined | null): string {
  if (n === undefined || n === null || typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const r = Math.round(n);
  return `${r < 0 ? '-' : ''}₹${group(r)}`;
}

function trim(n: number): string {
  return String(parseFloat(n.toFixed(2)));
}

export function formatShort(n: number | undefined | null): string {
  if (n === undefined || n === null || typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e5) {
    const lakh = parseFloat((a / 1e5).toFixed(2));
    if (lakh >= 100) return `${sign}₹${trim(a / 1e7)} Cr`;
    return `${sign}₹${trim(lakh)} L`;
  }
  return formatINR(n);
}

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function isIndianMobile(s: string): boolean {
  const t = String(s ?? '').replace(/[\s-]/g, '');
  return /^(?:\+91|91|0)?[6-9]\d{9}$/.test(t);
}
