import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { sanitizeBranchName } from './sanitizeBranchName.js';

/**
 * @param {{ outputRoot: string, branch: string }} input
 * @returns {Promise<string[]>}
 */
export async function listSnapshotPaths(input) {
  const dir = join(input.outputRoot, sanitizeBranchName(input.branch));
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => join(dir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}
