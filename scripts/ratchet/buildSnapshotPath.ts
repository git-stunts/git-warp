import { join } from 'node:path';

import { sanitizeBranchName } from './sanitizeBranchName.ts';

/**
 * @param {{ outputRoot: string, branch: string, label: string }} input
 * @returns {string}
 */
export function buildSnapshotPath(input: { outputRoot: string, branch: string, label: string }): string {
  return join(input.outputRoot, sanitizeBranchName(input.branch), `${input.label}.json`);
}
