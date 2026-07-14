#!/usr/bin/env node

/**
 * v17.0.0 import path migration script.
 *
 * Scans .ts and .js files for imports from @git-stunts/git-warp internal
 * paths and updates them for the v17 file renames and directory moves.
 *
 * Usage:
 *   node scripts/migrations/v17.0.0/fix-imports.ts [--dry-run] [--dir <path>]
 *
 * Options:
 *   --dry-run   Show what would change without modifying files
 *   --dir       Directory to scan (default: current directory)
 */

import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { resolveMigrationScanDir } from './MigrationArguments.ts';
import { walkMigrationFiles } from './MigrationFileWalker.ts';

// ---------------------------------------------------------------------------
// Path rewrites: old path → new path
// ---------------------------------------------------------------------------

const PATH_REWRITES = new Map<string, string | null>([
  // .js → .ts extension changes (infrastructure adapters)
  ['adapters/GitTimelineHistoryAdapter.js', 'adapters/GitTimelineHistoryAdapter.ts'],
  ['adapters/InMemoryGraphAdapter.js', 'adapters/InMemoryGraphAdapter.ts'],
  ['adapters/NoOpLogger.js', 'adapters/NoOpLogger.ts'],
  ['adapters/ConsoleLogger.js', 'adapters/ConsoleLogger.ts'],
  ['adapters/ClockAdapter.js', 'adapters/ClockAdapter.ts'],
  ['adapters/NodeCryptoAdapter.js', 'adapters/NodeCryptoAdapter.ts'],
  ['adapters/WebCryptoAdapter.js', 'adapters/WebCryptoAdapter.ts'],
  ['adapters/BunHttpAdapter.js', 'adapters/BunHttpAdapter.ts'],
  ['adapters/DenoHttpAdapter.js', 'adapters/DenoHttpAdapter.ts'],
  ['adapters/CasBlobAdapter.js', 'adapters/CasBlobAdapter.ts'],
  ['adapters/CasSeekCacheAdapter.js', 'adapters/CasSeekCacheAdapter.ts'],

  // Directory moves
  ['services/BitmapIndexBuilder.js', 'services/index/BitmapIndexBuilder.ts'],
  ['services/BitmapIndexReader.js', 'services/index/BitmapIndexReader.ts'],
  ['services/IndexRebuildService.js', 'services/index/IndexRebuildService.ts'],
  ['services/CommitDagTraversalService.js', 'services/dag/CommitDagTraversalService.ts'],
  ['services/Observer.js', 'services/query/Observer.ts'],
  ['services/QueryBuilder.js', 'services/query/QueryBuilder.ts'],
  ['services/ProvenanceIndex.js', 'services/provenance/ProvenanceIndex.ts'],
  ['services/ProvenancePayload.js', 'services/provenance/ProvenancePayload.ts'],

  // V5/V1 renames + directory moves
  ['services/StateReaderV5.js', 'services/state/StateReader.ts'],
  ['services/StateSerializerV5.js', 'services/state/StateSerializer.ts'],
  ['services/VisibleStateComparisonV5.js', 'services/comparison/VisibleStateComparison.ts'],
  ['services/VisibleStateScopeV1.js', 'services/VisibleStateScope.ts'],
  ['services/CheckpointSerializerV5.js', 'services/state/CheckpointSerializer.ts'],

  // Deleted modules
  ['services/StrandService.js', null],
  ['types/WarpTypes.js', null],
  ['types/WarpTypesV2.js', null],

  // PatchBuilder rename
  ['services/PatchBuilderV2.js', 'services/PatchBuilder.ts'],
]);

function rewriteImports(content: string): { readonly modified: string; readonly changeCount: number } {
  let modified = content;
  let changeCount = 0;

  for (const [oldSuffix, newSuffix] of PATH_REWRITES) {
    // Match imports containing the old path suffix
    const escaped = oldSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(from\\s+['"])([^'"]*${escaped})(['"])`, 'g');

    modified = modified.replace(pattern, (_match: string, prefix: string, fullPath: string, suffix: string) => {
      if (newSuffix === null) {
        // Deleted module — leave a comment
        changeCount++;
        return `${prefix}${fullPath}${suffix} /* REMOVED in v17 — see migration guide */`;
      }
      const newPath = fullPath.replace(oldSuffix, newSuffix);
      changeCount++;
      return `${prefix}${newPath}${suffix}`;
    });
  }

  return { modified, changeCount };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const scanDir = resolveMigrationScanDir(args, process.cwd());

let totalFiles = 0;
let totalChanges = 0;

for await (const filePath of walkMigrationFiles(scanDir)) {
  const content = await readFile(filePath, 'utf-8');
  const { modified, changeCount } = rewriteImports(content);

  if (changeCount > 0) {
    totalFiles++;
    totalChanges += changeCount;

    if (dryRun) {
      console.log(`[dry-run] ${filePath}: ${changeCount} import(s) to update`);
    } else {
      await writeFile(filePath, modified, 'utf-8');
      console.log(`updated ${filePath}: ${changeCount} import(s)`);
    }
  }
}

console.log(`\n${dryRun ? '[dry-run] ' : ''}${totalChanges} imports updated across ${totalFiles} files.`);
if (dryRun) {
  console.log('Run without --dry-run to apply changes.');
}
