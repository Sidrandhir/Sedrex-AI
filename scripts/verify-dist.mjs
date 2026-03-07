import fs from 'node:fs';
import path from 'node:path';

const distIndex = path.resolve('dist', 'index.html');

if (!fs.existsSync(distIndex)) {
  console.error('[verify:dist] dist/index.html was not found.');
  process.exit(1);
}

const html = fs.readFileSync(distIndex, 'utf8');

const forbidden = [
  '/dist/output.css',
  'localhost:8081',
  'refresh.js',
  'ws://localhost:',
];

const hits = forbidden.filter((needle) => html.includes(needle));

if (hits.length > 0) {
  console.error('[verify:dist] Deployment check failed. Forbidden references found in dist/index.html:');
  for (const hit of hits) {
    console.error(` - ${hit}`);
  }
  process.exit(1);
}

console.log('[verify:dist] OK - no forbidden dev/css references found in dist/index.html');
