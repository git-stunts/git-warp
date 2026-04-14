#!/usr/bin/env node

/**
 * v17.0.0 migration verification script.
 *
 * Scans your project for known v16 patterns that should have been
 * migrated. Reports any remaining issues.
 *
 * Usage:
 *   node scripts/migrations/v17.0.0/verify.js [--dir <path>]
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import process from 'node:process';

const EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx', '.mjs', '.mts']);

async function* walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue;
      }
      yield* walkFiles(fullPath);
    } else if (EXTENSIONS.has(extname(entry.name))) {
      yield fullPath;
    }
  }
}

// Patterns that indicate incomplete migration
const CHECKS = [
  { pattern: /from\s+['"].*\/StrandService\.js['"]/, message: 'StrandService.js was deleted — use graph.strands capability' },
  { pattern: /from\s+['"].*\/WarpTypes\.js['"]/, message: 'WarpTypes.js was deleted — use op class constructors' },
  { pattern: /from\s+['"].*\/WarpTypesV2\.js['"]/, message: 'WarpTypesV2.js was deleted — use Patch, PatchBuilder directly' },
  { pattern: /from\s+['"].*\/visualization\/['"]/, message: 'src/visualization/ was deleted — use @git-stunts/warp-ttd' },
  { pattern: /from\s+['"].*\/PatchBuilderV2\.js['"]/, message: 'PatchBuilderV2.js renamed to PatchBuilder.ts' },
  { pattern: /\bPatchV2\b/, message: 'PatchV2 renamed to Patch' },
  { pattern: /\bPatchBuilderV2\b/, message: 'PatchBuilderV2 renamed to PatchBuilder' },
  { pattern: /\bStateReaderV5\b/, message: 'StateReaderV5 renamed to StateReader' },
  { pattern: /\bStateSerializerV5\b/, message: 'StateSerializerV5 renamed to StateSerializer' },
  { pattern: /\bVisibleStateComparisonV5\b/, message: 'VisibleStateComparisonV5 renamed to VisibleStateComparison' },
  { pattern: /\bVisibleStateScopeV1\b/, message: 'VisibleStateScopeV1 renamed to VisibleStateScope' },
  { pattern: /\bcreateEventId\s*\(/, message: 'createEventId() removed — use new EventId()' },
  { pattern: /\bcreateDot\s*\(/, message: 'createDot() removed — use new Dot()' },
];

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const scanDir = dirIdx !== -1 ? args[dirIdx + 1] : process.cwd();

let issueCount = 0;

for await (const filePath of walkFiles(scanDir)) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    for (const check of CHECKS) {
      if (check.pattern.test(lines[i])) {
        console.log(`${filePath}:${i + 1}: ${check.message}`);
        issueCount++;
      }
    }
  }
}

if (issueCount === 0) {
  console.log('✓ No v16 migration issues found. You are ready for v17.0.0.');
  process.exitCode = 0;
} else {
  console.log(`\n✗ ${issueCount} issue(s) found. Run fix-imports.js and fix-renames.js, or fix manually.`);
  process.exitCode = 1;
}
