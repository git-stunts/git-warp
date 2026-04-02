#!/usr/bin/env node

/**
 * TS policy checker — IRONCLAD M9 enforcement gate.
 *
 * Enforces type safety rules across source files (src/, bin/, scripts/) and
 * public type declarations (index.d.ts).
 *
 * ZERO-TOLERANCE rules (must be 0, no exceptions):
 *   1. Ban @ts-ignore — use @ts-expect-error instead.
 *   2. Ban z.any() — use z.custom() or z.unknown() instead.
 *   3. Ban TODO(ts-cleanup) tags — all must be resolved.
 *   4. Ban `any` in public type declarations (index.d.ts type positions).
 *
 * RATCHETED rules (count locked by contracts/any-fence.json — can ONLY decrease):
 *   R1. `any` keyword in JSDoc type expressions.
 *   R2. Bare wildcard star in JSDoc type expressions.
 *   R3. Embedded star as type parameter in JSDoc generics.
 *
 * The ratchet prevents any NEW wildcards from being introduced. Existing count
 * is locked — if you fix one, update the fence downward. If the count INCREASES,
 * the gate blocks your push.
 *
 * Exit 0 when clean, 1 when violations found.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DIRS = ['src', 'bin', 'scripts'];
const SELF = relative(ROOT, new URL(import.meta.url).pathname);

/** @param {string} dir @returns {AsyncGenerator<string>} */
async function* walkJs(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkJs(full);
    } else if (entry.name.endsWith('.js')) {
      yield full;
    }
  }
}

// ── Rule patterns ──────────────────────────────────────────────────────────

const JSDOC_TAGS = '@(?:type|param|returns|return|property|prop|typedef|callback|template)';

// Zero-tolerance rules
const TS_IGNORE_RE = /@ts-ignore\b/;
const ZOD_ANY_RE = /z\.any\(\)/;
const TODO_CLEANUP_RE = /TODO\(ts-cleanup\)/;

// Ratcheted rules
const JSDOC_ANY_RE = new RegExp(`${JSDOC_TAGS}\\s+\\{[^}]*\\bany\\b`);
const JSDOC_BARE_STAR_RE = new RegExp(`${JSDOC_TAGS}\\s+\\{\\s*\\*\\s*\\}`);
const JSDOC_EMBEDDED_STAR_RE = new RegExp(
  `(?:${JSDOC_TAGS})\\s.*(?:<[^>]*\\*[^>]*>|\\{\\[[^\\]]+\\]:\\s*\\*\\s*\\})`
);

// ── Fence ──────────────────────────────────────────────────────────────────

async function loadFence() {
  const fencePath = join(ROOT, 'contracts', 'any-fence.json');
  try {
    const raw = await readFile(fencePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && /** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
      return null;
    }
    throw new Error(`Failed to load ${fencePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Scanning ───────────────────────────────────────────────────────────────

async function checkSourceFiles() {
  /** @type {string[]} */
  const hard = [];
  /** @type {string[]} */
  const ratcheted = [];

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
        const line = lines[i] ?? '';
        const loc = `${rel}:${i + 1}`;

        if (TS_IGNORE_RE.test(line)) {
          hard.push(`${loc}: @ts-ignore (use @ts-expect-error)`);
        }
        if (ZOD_ANY_RE.test(line)) {
          hard.push(`${loc}: z.any() (use z.custom() or z.unknown())`);
        }
        if (TODO_CLEANUP_RE.test(line)) {
          hard.push(`${loc}: TODO(ts-cleanup) tag`);
        }

        if (JSDOC_ANY_RE.test(line)) {
          ratcheted.push(`${loc}: 'any' in JSDoc type`);
        }
        if (JSDOC_BARE_STAR_RE.test(line)) {
          ratcheted.push(`${loc}: bare {star} in JSDoc type`);
        }
        if (JSDOC_EMBEDDED_STAR_RE.test(line)) {
          ratcheted.push(`${loc}: embedded star in JSDoc generic`);
        }
      }
    }
  }

  return { hard, ratcheted };
}

/**
 * Strips inline `//` and same-line block comments before token scanning.
 *
 * @param {string} line
 * @returns {string}
 */
export function stripInlineComments(line) {
  return line
    .replace(/\/\*.*?\*\//g, '')
    .replace(/\/\/.*$/, '');
}

/**
 * Finds `any` violations in public declarations after removing inline comments.
 *
 * @param {string} content
 * @param {string} [fileName]
 * @returns {string[]}
 */
export function findDeclarationAnyViolations(content, fileName = 'index.d.ts') {
  /** @type {string[]} */
  const violations = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = stripInlineComments(lines[i] ?? '');
    const trimmed = line.trim();
    if (
      trimmed.startsWith('*') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('/**') ||
      trimmed.startsWith('/*') ||
      trimmed === '*/'
    ) {
      continue;
    }
    if (/\bany\b/.test(line)) {
      violations.push(`${fileName}:${i + 1}: 'any' in type declaration`);
    }
  }

  return violations;
}

async function checkDeclarations() {
  const dtsPath = join(ROOT, 'index.d.ts');

  try {
    await stat(dtsPath);
  } catch {
    return [];
  }

  const content = await readFile(dtsPath, 'utf8');
  return findDeclarationAnyViolations(content, 'index.d.ts');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function check() {
  const [{ hard, ratcheted }, dtsViolations, fence] =
    await Promise.all([checkSourceFiles(), checkDeclarations(), loadFence()]);

  let failed = false;
  const allHard = [...hard, ...dtsViolations];

  // ── Zero-tolerance ────────────────────────────────────────────────────
  if (allHard.length > 0) {
    console.error('IRONCLAD M9 — HARD violations (zero tolerance):\n');
    for (const v of allHard) {
      console.error(`  ${v}`);
    }
    console.error(`\n  ${allHard.length} violation(s). Fix ALL.\n`);
    failed = true;
  }

  // ── Ratchet ───────────────────────────────────────────────────────────
  const count = ratcheted.length;
  const ceiling = fence ? fence.wildcardCount : null;

  if (ceiling !== null) {
    if (count > ceiling) {
      console.error(`IRONCLAD M9 — RATCHET BREACH: wildcard count INCREASED\n`);
      console.error(`  Fence ceiling : ${ceiling}`);
      console.error(`  Current count : ${count} (+${count - ceiling} new)\n`);
      for (const v of ratcheted) {
        console.error(`  ${v}`);
      }
      console.error('\n  New wildcards detected. Remove them or the push is blocked.\n');
      failed = true;
    } else if (count < ceiling) {
      console.log(`IRONCLAD M9 — ratchet: ${count}/${ceiling} wildcards (reduced by ${ceiling - count})`);
      console.log(`  Update contracts/any-fence.json → "wildcardCount": ${count}\n`);
    } else {
      console.log(`IRONCLAD M9 — ratchet: ${count}/${ceiling} wildcards (holding)`);
    }
  } else {
    console.log(`IRONCLAD M9 — wildcard count: ${count} (no fence — create contracts/any-fence.json to lock)`);
  }

  if (failed) {
    process.exit(1);
  }

  console.log('IRONCLAD M9 — type policy gate passed.');
}

check();
