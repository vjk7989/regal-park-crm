import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SEED = path.resolve(__dirname, '..', '..', 'data', 'seed.json');
const raw = fs.readFileSync(SEED, 'utf8');
const db = JSON.parse(raw);

describe('data/seed.json seedVersion', () => {
  it('is a 12-char lowercase hex string', () => {
    expect(typeof db.seedVersion).toBe('string');
    expect(db.seedVersion).toMatch(/^[0-9a-f]{12}$/);
  });

  it('equals sha1-12 of the content without the seedVersion field', () => {
    const { seedVersion, ...rest } = db;
    const hash = createHash('sha1').update(JSON.stringify(rest, null, 2) + '\n').digest('hex').slice(0, 12);
    expect(seedVersion).toBe(hash);
  });

  it('file on disk is the canonical serialisation (so the hash input is reproducible)', () => {
    expect(raw.replace(/\r\n/g, '\n')).toBe(JSON.stringify(db, null, 2) + '\n');
  });

  it('any content change produces a different version', () => {
    const { seedVersion, ...rest } = db;
    rest.leads = rest.leads.slice(1);
    const hash = createHash('sha1').update(JSON.stringify(rest, null, 2) + '\n').digest('hex').slice(0, 12);
    expect(hash).not.toBe(seedVersion);
  });

  it('x (module data) is present in the seed', () => {
    expect(db.x && typeof db.x).toBe('object');
  });
});
