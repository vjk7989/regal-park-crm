import { describe, expect, it } from 'vitest';
import { formatDate, formatINR, formatShort, isIndianMobile } from '../../shared/format';

// PLAN §2: formatINR → ₹4,30,00,000 (en-IN); formatShort → ₹4.3 Cr / ₹45 L / ₹85,000; dates DD MMM YYYY.
const DASH = '—';

describe('formatINR', () => {
  it('formats the §2 example with Indian lakh/crore grouping', () => {
    expect(formatINR(43000000)).toBe('₹4,30,00,000');
  });
  it('formats zero', () => {
    expect(formatINR(0)).toBe('₹0');
  });
  it.each([
    [1, '₹1'],
    [999, '₹999'],
    [1000, '₹1,000'],
    [99999, '₹99,999'],
    [100000, '₹1,00,000'],
    [999999, '₹9,99,999'],
    [1000000, '₹10,00,000'],
    [10000000, '₹1,00,00,000'],
    [1000000000, '₹1,00,00,00,000'],
  ])('grouping boundary %d → %s', (n, out) => {
    expect(formatINR(n)).toBe(out);
  });
  it('matches Intl en-IN grouping across a sweep of integers', () => {
    const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
    for (const n of [12, 123, 1234, 12345, 123456, 1234567, 12345678, 123456789, 1234567890, 45500000, 250000]) {
      expect(formatINR(n)).toBe(`₹${nf.format(n)}`);
    }
  });
  it('formats negatives with a leading minus and the same grouping', () => {
    expect(formatINR(-43000000)).toBe('-₹4,30,00,000');
    expect(formatINR(-999)).toBe('-₹999');
  });
  it('rounds decimals to whole rupees', () => {
    expect(formatINR(1234.4)).toBe('₹1,234');
    expect(formatINR(1234.5)).toBe('₹1,235');
    expect(formatINR(99999.6)).toBe('₹1,00,000');
  });
  it('does not render a negative zero for tiny negatives', () => {
    expect(formatINR(-0.4)).toBe('₹0');
  });
  it.each([
    ['NaN', NaN],
    ['undefined', undefined],
    ['null', null],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
  ])('%s → em dash', (_l, v) => {
    expect(formatINR(v as number | undefined | null)).toBe(DASH);
  });
  it('rejects non-number input (string) with em dash', () => {
    expect(formatINR('4300' as unknown as number)).toBe(DASH);
  });
});

describe('formatShort', () => {
  it('exact 1e7 → ₹1 Cr', () => {
    expect(formatShort(1e7)).toBe('₹1 Cr');
  });
  it('4.3e7 → ₹4.3 Cr (trailing zero trimmed)', () => {
    expect(formatShort(4.3e7)).toBe('₹4.3 Cr');
  });
  it.each([
    [45500000, '₹4.55 Cr'],
    [15000000, '₹1.5 Cr'],
    [12340000, '₹1.23 Cr'],
    [66000000, '₹6.6 Cr'],
    [1e9, '₹100 Cr'],
  ])('crore %d → %s', (n, out) => {
    expect(formatShort(n)).toBe(out);
  });
  it('4.5e6 → ₹45 L', () => {
    expect(formatShort(4500000)).toBe('₹45 L');
  });
  it('exact 1e5 boundary → ₹1 L', () => {
    expect(formatShort(1e5)).toBe('₹1 L');
  });
  it('1.25e5 → ₹1.25 L', () => {
    expect(formatShort(125000)).toBe('₹1.25 L');
  });
  it('just below 1e5 (99,999) falls back to full rupees', () => {
    expect(formatShort(99999)).toBe('₹99,999');
  });
  it('85,000 → ₹85,000', () => {
    expect(formatShort(85000)).toBe('₹85,000');
  });
  it('just below 1e7 must not render as "₹100 L" after rounding', () => {
    expect(formatShort(9999999)).not.toBe('₹100 L');
  });
  it('just below 1e7 that does not round (99.5 L) stays in lakhs', () => {
    expect(formatShort(9950000)).toBe('₹99.5 L');
  });
  it('zero → ₹0', () => {
    expect(formatShort(0)).toBe('₹0');
  });
  it('negatives keep sign in each band', () => {
    expect(formatShort(-4.3e7)).toBe('-₹4.3 Cr');
    expect(formatShort(-4500000)).toBe('-₹45 L');
    expect(formatShort(-85000)).toBe('-₹85,000');
  });
  it.each([
    ['NaN', NaN],
    ['undefined', undefined],
    ['null', null],
    ['Infinity', Infinity],
  ])('%s → em dash', (_l, v) => {
    expect(formatShort(v as number | undefined | null)).toBe(DASH);
  });
});

describe('formatDate (DD MMM YYYY)', () => {
  it('formats a full ISO timestamp', () => {
    expect(formatDate('2026-11-22T10:00:00.000Z')).toBe('22 Nov 2026');
  });
  it('formats a date-only string without timezone drift', () => {
    expect(formatDate('2026-11-22')).toBe('22 Nov 2026');
    expect(formatDate('2028-12-31')).toBe('31 Dec 2028');
    expect(formatDate('2026-01-10')).toBe('10 Jan 2026');
  });
  it('zero-pads single-digit days (DD)', () => {
    expect(formatDate('2026-03-05')).toBe('05 Mar 2026');
    expect(formatDate('2026-01-01')).toBe('01 Jan 2026');
  });
  it('invalid string → em dash', () => {
    expect(formatDate('not-a-date')).toBe(DASH);
    expect(formatDate('2026-13-45')).toBe(DASH);
  });
  it('empty / null / undefined → em dash', () => {
    expect(formatDate('')).toBe(DASH);
    expect(formatDate(null)).toBe(DASH);
    expect(formatDate(undefined)).toBe(DASH);
  });
});

describe('isIndianMobile', () => {
  it.each(['9876543210', '6000000000', '7123456789', '8999999999'])('10 digits starting 6-9: %s → true', s => {
    expect(isIndianMobile(s)).toBe(true);
  });
  it.each(['+919876543210', '+91 98765 43210', '919876543210', '09876543210', '+91-98765-43210', '98765 43210', '98765-43210', ' 9876543210 '])(
    'accepted prefix / separators: %s → true', s => {
      expect(isIndianMobile(s)).toBe(true);
    });
  it.each([
    ['starts with 5', '5876543210'],
    ['starts with 0 then 5', '05876543210'],
    ['9 digits', '987654321'],
    ['11 digits', '98765432101'],
    ['12 digits no plus', '987654321012'],
    ['letters', 'abcdefghij'],
    ['letter inside', '98765a4321'],
    ['empty', ''],
    ['prefix only', '+91'],
    ['+92 country code', '+929876543210'],
    ['double prefix', '+91 0 9876543210'],
    ['dots as separators', '98765.43210'],
  ])('%s (%s) → false', (_l, s) => {
    expect(isIndianMobile(s)).toBe(false);
  });
  it('null/undefined → false without throwing', () => {
    expect(isIndianMobile(null as unknown as string)).toBe(false);
    expect(isIndianMobile(undefined as unknown as string)).toBe(false);
  });
});
