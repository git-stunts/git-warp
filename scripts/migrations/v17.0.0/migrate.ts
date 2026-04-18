#!/usr/bin/env node

/**
 * v17.0.0 substrate migration entrypoint.
 *
 * This script is the compatibility boundary for the ORSet/checkpoint
 * substrate break. Legacy readers and translation logic belong here
 * (or in private helpers imported by this file), not in shipped runtime
 * code under src/.
 *
 * Intended responsibilities:
 * - detect the graph's current substrate/checkpoint format
 * - read legacy ORSet-backed state and checkpoints
 * - rewrite them into the v17 trie-backed checkpoint envelope format
 * - update refs only after the full migration succeeds
 * - verify the migrated graph before exit
 *
 * Usage:
 *   node scripts/migrations/v17.0.0/migrate.js --graph <name> [--repo <path>] [--dry-run]
 */

import process from 'node:process';

function usage(): string {
  return [
    'v17.0.0 substrate migration is not implemented yet.',
    '',
    'This entrypoint exists to keep legacy graph readers out of shipped runtime code.',
    'Implement the migration here and in private helpers under scripts/migrations/v17.0.0/.',
  ].join('\n');
}

process.stderr.write(`${usage()}\n`);
process.exitCode = 1;
