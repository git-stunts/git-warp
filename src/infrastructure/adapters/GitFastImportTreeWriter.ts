import { Buffer } from 'node:buffer';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import type GitFastImportTreeScript from './GitFastImportTreeScript.ts';
import { type GitPlumbing, toGitError, wrapGitError } from './gitErrorClassification.ts';

/** The one line `ls ""` prints, the root tree of the program; the empty path's tab may be trimmed. */
const ROOT_LINE = /^040000 tree ([0-9a-f]{40}|[0-9a-f]{64})\t?$/u;
/** Fast-import ran but its output is not the one root line the script asks for. */
export const E_FAST_IMPORT_PROTOCOL = 'E_FAST_IMPORT_PROTOCOL';

/**
 * Runs a `GitFastImportTreeScript` as one `git fast-import` process and
 * returns the id of the tree it built. Every object the script creates is
 * written by that process; nothing else is spawned.
 */
export default class GitFastImportTreeWriter {
  readonly #plumbing: Pick<GitPlumbing, 'execute'>;

  constructor(options: { readonly plumbing: Pick<GitPlumbing, 'execute'> }) {
    this.#plumbing = options.plumbing;
  }

  async write(script: GitFastImportTreeScript): Promise<string> {
    let output: string;
    try {
      output = await this.#plumbing.execute({ args: ['fast-import', '--quiet', '--done'], input: Buffer.from(script.encode()) });
    } catch (raw) {
      throw wrapGitError(toGitError(raw), {});
    }
    return rootTreeOf(output);
  }
}

/** The root tree id from the program's output, which must be exactly the `ls ""` line. */
function rootTreeOf(output: string): string {
  const lines = output.split('\n').filter((line) => line !== '');
  const match = ROOT_LINE.exec(lines.length === 1 ? lines.join('') : '');
  if (match?.[1] === undefined) {
    throw new PersistenceError(`git fast-import did not report one root tree: ${JSON.stringify(output)}`, E_FAST_IMPORT_PROTOCOL);
  }
  return match[1];
}
