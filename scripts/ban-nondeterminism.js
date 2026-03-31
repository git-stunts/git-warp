#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// © James Ross Ω FLYING•ROBOTS <https://github.com/flyingrobots>

/**
 * Determinism Drill Sergeant: ban nondeterministic APIs and patterns
 * from domain code.
 *
 * Infrastructure adapters, tests, CLI, and scripts are excluded —
 * they run outside the deterministic boundary. Only domain code
 * (src/domain/) must be clean.
 *
 * Usage:
 *   node scripts/ban-nondeterminism.js
 *
 * Allowlist: .ban-nondeterminism-allowlist (one glob per line, # comments)
 */

import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Paths to scan — domain code only. Infrastructure, tests, CLI are exempt.
const SCAN_PATHS = [
  'src/domain',
];

// Patterns: conservative and intentionally annoying.
// If you hit a false positive, refactor; don't immediately allowlist.
const PATTERNS = [
  // Wall-clock time (core determinism killer)
  { pattern: '\\bDate\\.now\\b', label: 'Date.now()' },
  { pattern: '\\bnew Date\\b', label: 'new Date()' },
  { pattern: '\\bperformance\\.now\\b', label: 'performance.now()' },

  // Randomness
  { pattern: '\\bMath\\.random\\b', label: 'Math.random()' },
  { pattern: '\\bcrypto\\.randomUUID\\b', label: 'crypto.randomUUID()' },
  { pattern: '\\bcrypto\\.getRandomValues\\b', label: 'crypto.getRandomValues()' },

  // Non-deterministic JSON serialization
  { pattern: '\\bJSON\\.stringify\\b', label: 'JSON.stringify() — use canonicalStringify for deterministic output' },

  // Unordered iteration that may vary across engines
  // Object.keys without sort is hard to detect with regex — deferred to code review

  // Process / environment variability
  { pattern: '\\bprocess\\.env\\b', label: 'process.env' },
  { pattern: '\\bprocess\\.pid\\b', label: 'process.pid' },
  { pattern: '\\bprocess\\.hrtime\\b', label: 'process.hrtime' },

  // Node-specific APIs banned in domain (already enforced by ESLint for Buffer)
  { pattern: '\\bsetTimeout\\b', label: 'setTimeout — use ClockPort' },
  { pattern: '\\bsetInterval\\b', label: 'setInterval — use ClockPort' },
];

// No allowlist. Every violation gets fixed or the code doesn't ship.

/**
 * @param {string} pattern
 * @param {string[]} paths
 * @returns {string[]}
 */
function search(pattern, paths) {
  const globArgs = paths.map((p) => `--glob '${p}/**/*.js'`).join(' ');
  try {
    const cmd = `rg -n --no-heading "${pattern}" ${globArgs} ${ROOT}`;
    const output = execSync(cmd, { encoding: 'utf8', cwd: ROOT });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    // rg exits 1 when no matches — that's success for us
    return [];
  }
}

console.log('ban-nondeterminism: scanning paths:');
for (const p of SCAN_PATHS) {
  console.log(`  - ${p}`);
}
console.log();

let totalViolations = 0;

for (const { pattern, label } of PATTERNS) {
  const matches = search(pattern, SCAN_PATHS);
  const filtered = matches;

  if (filtered.length > 0) {
    console.log(`BANNED: ${label}`);
    for (const line of filtered) {
      console.log(`  ${line}`);
    }
    console.log();
    totalViolations += filtered.length;
  }
}

if (totalViolations > 0) {
  console.log(`ban-nondeterminism: FAILED (${totalViolations} violation(s)).`);
  console.log('Fix the code or justify an exception in .ban-nondeterminism-allowlist.');
  process.exit(1);
} else {
  console.log('ban-nondeterminism: PASSED.');
}
