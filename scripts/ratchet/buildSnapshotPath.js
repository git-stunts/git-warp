import { join } from 'node:path';

import { sanitizeBranchName } from './sanitizeBranchName.js';

/**
 * @param {{ outputRoot: string, branch: string, label: string }} input
 * @returns {string}
 */
export function buildSnapshotPath(input) {
  return join(input.outputRoot, sanitizeBranchName(input.branch), `${input.label}.json`);
}
