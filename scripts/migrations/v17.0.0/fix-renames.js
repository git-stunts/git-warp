#!/usr/bin/env node

/**
 * v17.0.0 symbol rename migration script.
 *
 * Scans .ts and .js files for renamed symbols (PatchV2 → Patch,
 * Lens → Aperture, V5/V1 suffixes) and updates them.
 *
 * Usage:
 *   node scripts/migrations/v17.0.0/fix-renames.js [--dry-run] [--dir <path>]
 *
 * Options:
 *   --dry-run   Show what would change without modifying files
 *   --dir       Directory to scan (default: current directory)
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import process from 'node:process';

// ---------------------------------------------------------------------------
// Symbol renames: [pattern, replacement, description]
// ---------------------------------------------------------------------------

const RENAMES = [
  // V2 suffix drops
  [/\bPatchV2\b/g, 'Patch', 'PatchV2 → Patch'],
  [/\bPatchBuilderV2\b/g, 'PatchBuilder', 'PatchBuilderV2 → PatchBuilder'],

  // V5 suffix drops
  [/\bStateReaderV5\b/g, 'StateReader', 'StateReaderV5 → StateReader'],
  [/\bStateSerializerV5\b/g, 'StateSerializer', 'StateSerializerV5 → StateSerializer'],
  [/\bCheckpointSerializerV5\b/g, 'CheckpointSerializer', 'CheckpointSerializerV5 → CheckpointSerializer'],
  [/\bVisibleStateComparisonV5\b/g, 'VisibleStateComparison', 'VisibleStateComparisonV5 → VisibleStateComparison'],
  [/\bVisibleStateTransferPlannerV5\b/g, 'VisibleStateTransferPlanner', 'VisibleStateTransferPlannerV5 → VisibleStateTransferPlanner'],

  // V1 suffix drops
  [/\bVisibleStateScopeV1\b/g, 'VisibleStateScope', 'VisibleStateScopeV1 → VisibleStateScope'],

  // Observer geometry rename
  [/\bLens\b(?!\s*=)/g, 'Aperture', 'Lens → Aperture'],

  // Factory function removals
  [/\bcreateEventId\b/g, 'new EventId', 'createEventId → new EventId'],
  [/\bcreateDot\b/g, 'new Dot', 'createDot → new Dot'],
];

// ---------------------------------------------------------------------------
// File scanner
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Rewriter
// ---------------------------------------------------------------------------

function rewriteSymbols(content) {
  let modified = content;
  const changes = [];

  for (const [pattern, replacement, description] of RENAMES) {
    const matches = modified.match(pattern);
    if (matches && matches.length > 0) {
      modified = modified.replace(pattern, replacement);
      changes.push(`${description} (${matches.length}x)`);
    }
  }

  return { modified, changes };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dirIdx = args.indexOf('--dir');
const scanDir = dirIdx !== -1 ? args[dirIdx + 1] : process.cwd();

let totalFiles = 0;
let totalChanges = 0;

for await (const filePath of walkFiles(scanDir)) {
  const content = await readFile(filePath, 'utf-8');
  const { modified, changes } = rewriteSymbols(content);

  if (changes.length > 0) {
    totalFiles++;
    totalChanges += changes.length;

    if (dryRun) {
      console.log(`[dry-run] ${filePath}:`);
      for (const change of changes) {
        console.log(`  ${change}`);
      }
    } else {
      await writeFile(filePath, modified, 'utf-8');
      console.log(`updated ${filePath}:`);
      for (const change of changes) {
        console.log(`  ${change}`);
      }
    }
  }
}

console.log(`\n${dryRun ? '[dry-run] ' : ''}${totalChanges} renames across ${totalFiles} files.`);
if (dryRun) {
  console.log('Run without --dry-run to apply changes.');
}
