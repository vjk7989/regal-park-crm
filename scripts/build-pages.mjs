import { copyFileSync, writeFileSync } from 'node:fs';

process.env.VITE_STATIC = '1';
process.env.VITE_BASE = '/regal-park-crm/';

const { build } = await import('vite');
await build();
copyFileSync('dist/index.html', 'dist/404.html');
writeFileSync('dist/.nojekyll', '');
