#!/usr/bin/env node

/**
 * v17.0.0 cache migration — clear legacy blob-based caches.
 *
 * Deletes checkpoint, coverage (index), and seek-cache refs for all
 * WARP graphs in the repository. The blobs they reference become
 * unreachable and will be collected by `git gc`.
 *
 * v17.0.0 writes these caches through @git-stunts/git-cas (chunked,
 * streaming, content-addressed). Old raw-blob caches are incompatible
 * and must be cleared. They rebuild automatically on next open().
 *
 * Usage:
 *   node scripts/migrations/v17.0.0/clear-legacy-caches.ts [<repo-path>]
 *
 * Defaults to the current working directory.
 */

import { execSync } from 'node:child_process';
import process from 'node:process';

const repoPath = process.argv[2] ?? process.cwd();

/** Refs that point to rebuildable cache data (not durable records). */
const CACHE_REF_SUFFIXES = [
  '/checkpoints/head',
  '/coverage/head',
  '/seek-cache',
];

function git(args: string): string {
  return execSync(`git ${args}`, { cwd: repoPath, encoding: 'utf8' }).trim();
}

function listWarpGraphNames(): string[] {
  let output: string;
  try {
    output = git('for-each-ref --format=%(refname) refs/warp/');
  } catch {
    return [];
  }
  if (!output) { return []; }

  const graphNames = new Set<string>();
  for (const ref of output.split('\n')) {
    // refs/warp/<graphName>/writers/<id>  → extract graphName
    // refs/warp/<graphName>/checkpoints/head → extract graphName
    const withoutPrefix = ref.replace(/^refs\/warp\//, '');
    // Find the first known segment to determine where graphName ends
    for (const suffix of ['writers/', 'checkpoints/', 'coverage/', 'cursor/', 'strands/', 'strand-overlays/', 'strand-braids/', 'audit/', 'trust/', 'seek-cache']) {
      const idx = withoutPrefix.indexOf(`/${suffix}`);
      if (idx !== -1) {
        graphNames.add(withoutPrefix.slice(0, idx));
        break;
      }
      // seek-cache is a leaf, not a prefix
      if (suffix === 'seek-cache' && withoutPrefix.endsWith('/seek-cache')) {
        graphNames.add(withoutPrefix.slice(0, withoutPrefix.length - '/seek-cache'.length));
      }
    }
  }
  return [...graphNames].sort();
}

function deleteRef(ref: string): boolean {
  try {
    git(`update-ref -d ${ref}`);
    return true;
  } catch {
    return false;
  }
}

// ── Main ───────────────────────────────────────────────────────────────

const graphs = listWarpGraphNames();

if (graphs.length === 0) {
  process.stdout.write('No WARP graphs found in this repository.\n');
  process.exit(0);
}

let deletedCount = 0;
let skippedCount = 0;

for (const graphName of graphs) {
  for (const suffix of CACHE_REF_SUFFIXES) {
    const ref = `refs/warp/${graphName}${suffix}`;
    let exists: boolean;
    try {
      git(`rev-parse --verify --quiet ${ref}`);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists) {
      if (deleteRef(ref)) {
        process.stdout.write(`  deleted ${ref}\n`);
        deletedCount++;
      } else {
        process.stderr.write(`  FAILED to delete ${ref}\n`);
      }
    } else {
      skippedCount++;
    }
  }
}

process.stdout.write(`\nDone. ${deletedCount} cache ref(s) deleted, ${skippedCount} already absent.\n`);
if (deletedCount > 0) {
  process.stdout.write('Run `git gc` to reclaim disk space from unreachable cache blobs.\n');
}
