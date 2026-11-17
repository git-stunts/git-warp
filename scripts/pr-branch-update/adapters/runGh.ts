import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import PrBranchUpdateError from '../PrBranchUpdateError.ts';

const execFile = promisify(execFileCallback);
const GH_TIMEOUT_MS = 60_000;
const GH_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

/** Runs one `gh` command and returns its standard output. */
export type GhRunner = (args: readonly string[]) => Promise<string>;

/**
 * The real GhRunner. `gh` reads its token from GH_TOKEN; this module never
 * sees it. A failure names `gh api <endpoint>` and carries gh's own error.
 */
export default async function runGh(args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await execFile('gh', [...args], { encoding: 'utf8', timeout: GH_TIMEOUT_MS, maxBuffer: GH_MAX_BUFFER_BYTES });
    return stdout;
  } catch (error) {
    throw new PrBranchUpdateError(`gh ${args.slice(0, 2).join(' ')} failed: ${detailOf(error)}`);
  }
}

/** gh writes the HTTP status and GitHub's message to stderr; prefer it to Node's summary. */
function detailOf(error: unknown): string {
  const stderr = stderrOf(error);
  if (stderr !== '') {
    return stderr;
  }
  return error instanceof Error ? error.message : String(error);
}

function stderrOf(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return '';
  }
  const stderr: unknown = Reflect.get(error, 'stderr');
  return typeof stderr === 'string' ? stderr.trim() : '';
}
