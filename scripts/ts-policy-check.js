#!/usr/bin/env node

/**
 * TS policy checker — enforces two rules in source files (src/, bin/, scripts/):
 *
 * 1. Ban @ts-ignore — use @ts-expect-error instead.
 * 2. Require TODO(ts-cleanup) tag on every inline wildcard cast.
 *
 * Exit 0 when clean, 1 when violations found.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DIRS = ['src', 'bin', 'scripts'];
const SELF = relative(ROOT, new URL(import.meta.url).pathname);

/** @param {string} dir @returns {AsyncGenerator<string>} */
async function* walkJs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkJs(full);
    } else if (entry.name.endsWith('.js')) {
      yield full;
    }
  }
}

/* eslint-disable no-control-regex */
const TS_IGNORE_RE = /@ts-ignore\b/;
const WILDCARD_CAST_RE = /@type\s+\{(\*|any)\}/;
const TAG_RE = /TODO\(ts-cleanup\)/;
/* eslint-enable no-control-regex */

async function check() {
  const violations = [];

  for (const dir of DIRS) {
    const abs = join(ROOT, dir);
    for await (const filePath of walkJs(abs)) {
      const rel = relative(ROOT, filePath);
      if (rel === SELF) {
        continue;
      }
      const content = await readFile(filePath, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (TS_IGNORE_RE.test(line)) {
          violations.push(`${rel}:${i + 1}: error: use @ts-expect-error instead of @ts-ignore`);
        }
        if (WILDCARD_CAST_RE.test(line) && !TAG_RE.test(line)) {
          violations.push(`${rel}:${i + 1}: error: wildcard cast missing TODO(ts-cleanup) tag`);
        }
      }
    }
  }

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(v);
    }
    console.error(`\n${violations.length} policy violation(s) found.`);
    process.exit(1);
  }

  console.log('TS policy check passed.');
}

check();
