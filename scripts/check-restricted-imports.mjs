import fs from 'node:fs';
import path from 'node:path';

const roots = ['apps/api/src', 'apps/worker/src'];
const forbidden = [
  "from 'pg'",
  'from "pg"',
  "require('pg')",
  'require("pg")',
];

let failed = false;

for (const root of roots) {
  const abs = path.resolve(root);
  if (!fs.existsSync(abs)) continue;
  const stack = [abs];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const needle of forbidden) {
        if (text.includes(needle)) {
          console.error(`Restricted import in ${full}: ${needle}`);
          failed = true;
        }
      }
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('Restricted import check passed');
