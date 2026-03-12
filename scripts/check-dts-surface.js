#!/usr/bin/env node

/**
 * B41 — Declaration Surface Validator
 *
 * Cross-checks the type-surface.m8.json manifest against:
 * 1. index.js   — named runtime exports
 * 2. index.d.ts — declaration exports
 *
 * Manifest structure:
 * - `exports`     — runtime-backed exports that must exist in both index.js and index.d.ts
 * - `typeExports` — type-only declarations that must exist in index.d.ts only
 *
 * Exits non-zero on any missing declaration.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/**
 * @param {string} filePath
 * @returns {string}
 */
function readRequired(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err instanceof Error && /** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
      process.stderr.write(
        `ERROR: Cannot find ${filePath}\nEnsure you are running from the repository root.\n`
      );
      process.exit(1);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Parsers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Parse the body of an `export { ... }` block and return the exported names.
 * Handles single-line comments, `type` keyword prefix, and `as` aliases.
 * @param {string} blockBody - The content inside the braces (e.g., 'Foo, Bar as Baz')
 * @returns {Set<string>}
 */
export function parseExportBlock(blockBody) {
  const names = new Set();
  // Strip single-line comments before splitting on commas
  const cleaned = blockBody.replace(/\/\/[^\n]*/g, '');
  for (const item of cleaned.split(',')) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    // Handle `type Foo` — strip leading `type` keyword
    const withoutTypeKeyword = trimmed.replace(/^type\s+/, '');
    // Handle `Foo as Bar` — the exported name is Bar
    const asParts = withoutTypeKeyword.split(/\s+as\s+/);
    const exportedName = (asParts.length > 1 ? asParts[1] : asParts[0]).trim();
    if (exportedName) {
      names.add(exportedName);
    }
  }
  return names;
}

/**
 * Find all `export { ... }` blocks in source and parse their contents.
 * @param {string} src - Full source text
 * @returns {Set<string>}
 */
function collectExportBlocks(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const name of parseExportBlock(m[1])) {
      names.add(name);
    }
  }
  return names;
}

/**
 * Extract names from `export { A, B, C };` blocks and `export default`.
 * @param {string} src
 * @returns {Set<string>}
 */
export function extractJsExports(src) {
  const names = collectExportBlocks(src);
  // Match standalone `export const Foo` / `export function Foo` / `export class Foo`
  for (const m of src.matchAll(/export\s+(?:const|function|class)\s+(\w+)/g)) {
    names.add(m[1]);
  }
  // Match `export default class Foo` / `export default function Foo`
  for (const m of src.matchAll(/export\s+default\s+(?:class|function)\s+(\w+)/g)) {
    names.add(m[1]);
  }
  // Match `export default Foo` (standalone identifier)
  for (const m of src.matchAll(/export\s+default\s+([A-Z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  return names;
}

/**
 * @param {string} src
 * @returns {Set<string>}
 */
export function extractDtsExports(src) {
  const names = new Set();

  // export class Foo / export abstract class Foo
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:abstract\s+)?class\s+(\w+)/g)) {
    names.add(m[1]);
  }
  // export interface Foo / export declare interface Foo
  for (const m of src.matchAll(/export\s+(?:declare\s+)?interface\s+(\w+)/g)) {
    names.add(m[1]);
  }
  // export type Foo = / export declare type Foo =
  for (const m of src.matchAll(/export\s+(?:declare\s+)?type\s+(\w+)\s*=/g)) {
    names.add(m[1]);
  }
  // export const Foo / export function Foo
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:const|function)\s+(\w+)/g)) {
    names.add(m[1]);
  }
  // export namespace Foo / export declare namespace Foo
  for (const m of src.matchAll(/export\s+(?:declare\s+)?namespace\s+(\w+)/g)) {
    names.add(m[1]);
  }
  // export default class Foo / export default function Foo
  for (const m of src.matchAll(/export\s+(?:declare\s+)?default\s+(?:class|function)\s+(\w+)/g)) {
    names.add(m[1]);
  }
  // export default Foo  (standalone identifier — class declared separately)
  for (const m of src.matchAll(
    /export\s+(?:declare\s+)?default\s+(?!(?:class|function)\b)([A-Z_$][\w$]*)/g
  )) {
    names.add(m[1]);
  }
  // export { A as B } — exported name is B
  for (const name of collectExportBlocks(src)) {
    names.add(name);
  }
  return names;
}

const TYPE_ONLY_KINDS = new Set(['interface', 'type']);

/**
 * Splits manifest exports into runtime-backed and type-only names using the
 * explicit `exports` and `typeExports` sections.
 *
 * `exports` should contain only runtime-backed declarations.
 * `typeExports` should contain only `interface` and `type` declarations.
 *
 * @param {{ exports?: Record<string, { kind?: string }>, typeExports?: Record<string, { kind?: string }> }} manifest
 * @returns {{ manifestNames: Set<string>, runtimeNames: Set<string>, typeOnlyNames: Set<string>, duplicateNames: Set<string>, invalidRuntimeTypeOnly: Set<string>, invalidTypeSectionRuntime: Set<string> }}
 */
export function classifyManifestExports(manifest) {
  const manifestNames = new Set();
  const runtimeNames = new Set();
  const typeOnlyNames = new Set();
  const duplicateNames = new Set();
  const invalidRuntimeTypeOnly = new Set();
  const invalidTypeSectionRuntime = new Set();

  for (const [name, meta] of Object.entries(manifest.exports || {})) {
    if (manifestNames.has(name)) {
      duplicateNames.add(name);
    }
    manifestNames.add(name);
    runtimeNames.add(name);
    if (TYPE_ONLY_KINDS.has(meta?.kind || '')) {
      invalidRuntimeTypeOnly.add(name);
    }
  }

  for (const [name, meta] of Object.entries(manifest.typeExports || {})) {
    if (manifestNames.has(name)) {
      duplicateNames.add(name);
    }
    manifestNames.add(name);
    typeOnlyNames.add(name);
    if (!TYPE_ONLY_KINDS.has(meta?.kind || '')) {
      invalidTypeSectionRuntime.add(name);
    }
  }

  return {
    manifestNames,
    runtimeNames,
    typeOnlyNames,
    duplicateNames,
    invalidRuntimeTypeOnly,
    invalidTypeSectionRuntime,
  };
}

// ---------------------------------------------------------------------------
// Main — runs only when executed directly
// ---------------------------------------------------------------------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const quiet = process.argv.includes('--quiet');

  // 1. Load the manifest
  const manifestPath = resolve(root, 'contracts/type-surface.m8.json');
  const manifest = JSON.parse(readRequired(manifestPath));
  const {
    manifestNames,
    runtimeNames,
    typeOnlyNames,
    duplicateNames,
    invalidRuntimeTypeOnly,
    invalidTypeSectionRuntime,
  } = classifyManifestExports(manifest);

  // 2. Parse index.js — extract named exports
  const indexJs = readRequired(resolve(root, 'index.js'));
  const jsExports = extractJsExports(indexJs);

  // 3. Parse index.d.ts — extract all exported declarations
  const indexDts = readRequired(resolve(root, 'index.d.ts'));
  const dtsExports = extractDtsExports(indexDts);

  // 4. Cross-check
  let errors = 0;
  let warnings = 0;

  // Check A: Every manifest entry must exist in index.d.ts
  for (const name of manifestNames) {
    if (!dtsExports.has(name)) {
      process.stderr.write(`ERROR: manifest entry "${name}" missing from index.d.ts\n`);
      errors++;
    }
  }

  // Check B: Every named export in index.js must exist in the runtime manifest section
  for (const name of jsExports) {
    if (!runtimeNames.has(name)) {
      process.stderr.write(
        `ERROR: index.js export "${name}" missing from runtime exports manifest\n`
      );
      errors++;
    }
  }

  // Check C: Every runtime-backed manifest export must exist in index.js
  for (const name of runtimeNames) {
    if (!jsExports.has(name)) {
      process.stderr.write(`ERROR: manifest runtime export "${name}" missing from index.js\n`);
      errors++;
    }
  }

  // Check D: No export may appear in both manifest sections
  for (const name of duplicateNames) {
    process.stderr.write(
      `ERROR: manifest export "${name}" appears in both exports and typeExports\n`
    );
    errors++;
  }

  // Check E: `exports` must not contain interface/type entries
  for (const name of invalidRuntimeTypeOnly) {
    process.stderr.write(
      `ERROR: runtime manifest export "${name}" is type-only and must move to typeExports\n`
    );
    errors++;
  }

  // Check F: `typeExports` must contain only interface/type entries
  for (const name of invalidTypeSectionRuntime) {
    process.stderr.write(
      `ERROR: type-only manifest export "${name}" uses a runtime-backed kind and must move to exports\n`
    );
    errors++;
  }

  // Check G: Warn about index.d.ts exports not in manifest
  for (const name of dtsExports) {
    if (!manifestNames.has(name)) {
      process.stderr.write(`WARN: index.d.ts export "${name}" not in manifest\n`);
      warnings++;
    }
  }

  // 5. Report
  const total = manifestNames.size;
  const runtimeCount = runtimeNames.size;
  const typeOnlyCount = typeOnlyNames.size;
  const jsCount = jsExports.size;
  const dtsCount = dtsExports.size;

  if (!quiet) {
    process.stdout.write(`\nDeclaration surface check:\n`);
    process.stdout.write(`  Manifest entries:   ${total}\n`);
    process.stdout.write(`    Runtime-backed:   ${runtimeCount}\n`);
    process.stdout.write(`    Type-only:        ${typeOnlyCount}\n`);
    process.stdout.write(`  index.js exports:   ${jsCount}\n`);
    process.stdout.write(`  index.d.ts exports: ${dtsCount}\n`);
    process.stdout.write(`  Errors:   ${errors}\n`);
    process.stdout.write(`  Warnings: ${warnings}\n\n`);
  }

  if (errors > 0) {
    process.stderr.write(`FAIL: ${errors} declaration surface error(s)\n`);
    process.exit(1);
  }

  if (!quiet) {
    process.stdout.write(`PASS: all manifest entries covered\n`);
  }
}
