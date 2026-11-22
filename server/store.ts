import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from '../shared/types';

const repoData = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const dataDir = () => process.env.DATA_DIR ?? repoData;
const dbFile = () => path.join(dataDir(), 'db.json');
const seedFile = () => {
  const own = path.join(dataDir(), 'seed.json');
  return fs.existsSync(own) ? own : path.join(repoData, 'seed.json');
};

let db: DB | null = null;

/** Replace db.json with a fresh copy of seed.json and reload it. */
export function reset(): DB {
  fs.mkdirSync(dataDir(), { recursive: true });
  db = JSON.parse(fs.readFileSync(seedFile(), 'utf8')) as DB;
  save();
  return db;
}

export function getDb(): DB {
  if (db) return db;
  if (fs.existsSync(dbFile())) db = JSON.parse(fs.readFileSync(dbFile(), 'utf8')) as DB;
  else reset();
  return db!;
}

/** Write temp file then rename, so a crash never leaves a half-written db.json. */
export function save(): void {
  const tmp = dbFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbFile());
}
