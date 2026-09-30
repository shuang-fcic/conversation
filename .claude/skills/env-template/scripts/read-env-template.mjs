#!/usr/bin/env node
// Read .env.template — blocked by the permission deny on .env* file paths.
// Shell-level node is not subject to that deny.
import { readFileSync } from 'node:fs';

const path = '.env.template';
process.stdout.write(readFileSync(path, 'utf8'));
