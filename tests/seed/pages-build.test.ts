import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('scripts/build-pages.mjs', () => {
  const src = read('scripts/build-pages.mjs');

  it('sets VITE_STATIC=1 and VITE_BASE=/regal-park-crm/', () => {
    expect(src).toMatch(/process\.env\.VITE_STATIC\s*=\s*['"]1['"]/);
    expect(src).toMatch(/process\.env\.VITE_BASE\s*=\s*['"]\/regal-park-crm\/['"]/);
  });

  it('sets env before vite build runs', () => {
    const envAt = src.indexOf('VITE_STATIC');
    const buildAt = src.search(/await\s+build\(/);
    expect(buildAt).toBeGreaterThan(-1);
    expect(envAt).toBeLessThan(buildAt);
  });

  it('copies dist/index.html to dist/404.html after the build', () => {
    expect(src).toMatch(/copyFileSync\(\s*['"]dist\/index\.html['"]\s*,\s*['"]dist\/404\.html['"]\s*\)/);
    expect(src.indexOf('404.html')).toBeGreaterThan(src.search(/await\s+build\(/));
  });

  it('writes dist/.nojekyll', () => {
    expect(src).toMatch(/writeFileSync\(\s*['"]dist\/\.nojekyll['"]/);
  });

  it('package.json exposes build:pages running this script', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['build:pages']).toMatch(/scripts\/build-pages\.mjs/);
  });

  it('vite.config base honours VITE_BASE', () => {
    const files = fs.readdirSync(ROOT).filter(f => /^vite\.config\.(ts|js|mjs)$/.test(f));
    expect(files.length).toBe(1);
    expect(read(files[0])).toMatch(/base:\s*process\.env\.VITE_BASE/);
  });
});

describe('.github/workflows/pages.yml', () => {
  const yml = read('.github/workflows/pages.yml');

  it('triggers on push to main', () => {
    expect(yml).toMatch(/on:\s*\n\s+push:\s*\n\s+branches:\s*\[\s*main\s*\]/);
  });

  it('has pages: write and id-token: write permissions', () => {
    expect(yml).toMatch(/^\s*pages:\s*write\s*$/m);
    expect(yml).toMatch(/^\s*id-token:\s*write\s*$/m);
  });

  it('runs npm ci, typecheck, test, build:pages in that order', () => {
    const steps = ['npm ci', 'npm run typecheck', 'npm test', 'npm run build:pages'].map(s => {
      const i = yml.indexOf(`run: ${s}`);
      expect(i, s).toBeGreaterThan(-1);
      return i;
    });
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  });

  it('uploads dist as the pages artifact after building', () => {
    const up = yml.indexOf('actions/upload-pages-artifact');
    expect(up).toBeGreaterThan(yml.indexOf('run: npm run build:pages'));
    expect(yml.slice(up)).toMatch(/path:\s*dist\s*$/m);
  });

  it('deploys with actions/deploy-pages in a job that needs build', () => {
    expect(yml).toMatch(/uses:\s*actions\/deploy-pages@v\d+/);
    expect(yml).toMatch(/needs:\s*build/);
    expect(yml).toMatch(/name:\s*github-pages/);
  });
});
