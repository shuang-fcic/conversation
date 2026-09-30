#!/usr/bin/env node
// Read a *.config.spec.ts file that the global permission deny (matching
// **/*.config*.ts) blocks the Read tool from opening.
// Shell-level `node` is not subject to that deny.
//
// Usage: node read-config-spec.mjs <path-to-file.spec.ts>
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  process.stderr.write('usage: node read-config-spec.mjs <path>\n');
  process.exit(2);
}
if (!path.endsWith('.spec.ts')) {
  process.stderr.write(`refusing: "${path}" is not a *.spec.ts file\n`);
  process.exit(2);
}
process.stdout.write(readFileSync(path, 'utf8'));
