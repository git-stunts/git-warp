#!/usr/bin/env node

/**
 * B41 — Declaration Surface Validator
 *
 * Cross-checks the type-surface.m8.json manifest against:
 * 1. index.js  — named runtime exports
 * 2. index.d.ts — declaration exports
 *
 * Exits non-zero on any missing declaration.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// 1. Load the manifest
// ---------------------------------------------------------------------------
const manifestPath = resolve(root, 'contracts/type-surface.m8.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const manifestNames = new Set(Object.keys(manifest.exports));

// ---------------------------------------------------------------------------
// 2. Parse index.js — extract named exports from the `export { ... }` block
// ---------------------------------------------------------------------------
const indexJs = readFileSync(resolve(root, 'index.js'), 'utf8');

/**
 * Extract names from `export { A, B, C };` blocks.
 * @param {string} src
 * @returns {Set<string>}
 */
function extractJsExports(src) {
  const names = new Set();
  // Match export { ... } blocks (potentially multiline)
  const exportBlockRe = /export\s*\{([^}]+)\}/g;
  let m;
  while ((m = exportBlockRe.exec(src)) !== null) {
    // Strip single-line comments before splitting on commas
    const cleaned = m[1].replace(/\/\/[^\n]*/g, '');
    for (const item of cleaned.split(',')) {
      const trimmed = item.trim();
      if (!trimmed) {
        continue;
      }
      // Handle `Foo as Bar` — the exported name is Bar
      const asParts = trimmed.split(/\s+as\s+/);
      const exportedName = (asParts.length > 1 ? asParts[1] : asParts[0]).trim();
      if (exportedName) {
        names.add(exportedName);
      }
    }
  }
  // Match `export default <Name>`
  const defaultRe = /export\s+default\s+(\w+)/;
  const dm = defaultRe.exec(src);
  if (dm) {
    names.add(dm[1]);
  }
  return names;
}

const jsExports = extractJsExports(indexJs);

// ---------------------------------------------------------------------------
// 3. Parse index.d.ts — extract all exported declarations
// ---------------------------------------------------------------------------
const indexDts = readFileSync(resolve(root, 'index.d.ts'), 'utf8');

/**
 * @param {string} src
 * @returns {Set<string>}
 */
function extractDtsExports(src) {
  const names = new Set();

  // export class Foo / export abstract class Foo
  for (const m of src.matchAll(/export\s+(?:abstract\s+)?class\s+(\w+)/g)) {
    names.add(m[1]);
  }
  // export interface Foo
  for (const m of src.matchAll(/export\s+interface\s+(\w+)/g)) {
    names.add(m[1]);
  }
  // export type Foo =
  for (const m of src.matchAll(/export\s+type\s+(\w+)\s*=/g)) {
    names.add(m[1]);
  }
  // export const Foo / export function Foo
  for (const m of src.matchAll(/export\s+(?:const|function)\s+(\w+)/g)) {
    names.add(m[1]);
  }
  // export default class Foo
  for (const m of src.matchAll(/export\s+default\s+class\s+(\w+)/g)) {
    names.add(m[1]);
  }
  // export { A as B } — exported name is B
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const item of m[1].split(',')) {
      const trimmed = item.trim();
      if (!trimmed) {
        continue;
      }
      const asParts = trimmed.split(/\s+as\s+/);
      const exportedName = (asParts.length > 1 ? asParts[1] : asParts[0]).trim();
      if (exportedName) {
        names.add(exportedName);
      }
    }
  }
  return names;
}

const dtsExports = extractDtsExports(indexDts);

// ---------------------------------------------------------------------------
// 4. Cross-check
// ---------------------------------------------------------------------------
let errors = 0;
let warnings = 0;

// Check A: Every manifest entry must exist in index.d.ts
for (const name of manifestNames) {
  if (!dtsExports.has(name)) {
    process.stderr.write(`ERROR: manifest entry "${name}" missing from index.d.ts\n`);
    errors++;
  }
}

// Check B: Every named export in index.js must exist in the manifest
for (const name of jsExports) {
  if (!manifestNames.has(name)) {
    process.stderr.write(`ERROR: index.js export "${name}" missing from type-surface.m8.json manifest\n`);
    errors++;
  }
}

// Check C: Warn about index.d.ts exports not in manifest (type-only exports are valid)
for (const name of dtsExports) {
  if (!manifestNames.has(name)) {
    process.stderr.write(`WARN: index.d.ts export "${name}" not in manifest (type-only?)\n`);
    warnings++;
  }
}

// ---------------------------------------------------------------------------
// 5. Report
// ---------------------------------------------------------------------------
const total = manifestNames.size;
const jsCount = jsExports.size;
const dtsCount = dtsExports.size;

process.stdout.write(`\nDeclaration surface check:\n`);
process.stdout.write(`  Manifest entries:   ${total}\n`);
process.stdout.write(`  index.js exports:   ${jsCount}\n`);
process.stdout.write(`  index.d.ts exports: ${dtsCount}\n`);
process.stdout.write(`  Errors:   ${errors}\n`);
process.stdout.write(`  Warnings: ${warnings}\n\n`);

if (errors > 0) {
  process.stderr.write(`FAIL: ${errors} declaration surface error(s)\n`);
  process.exit(1);
}

process.stdout.write(`PASS: all manifest entries covered\n`);
