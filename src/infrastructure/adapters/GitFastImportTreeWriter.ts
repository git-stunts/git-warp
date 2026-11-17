import { Buffer } from 'node:buffer';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import { hexEncode, textEncode } from '../../domain/utils/bytes.ts';
import type RandomPort from '../../ports/RandomPort.ts';
import type GitFastImportTreeScript from './GitFastImportTreeScript.ts';
import { type GitPlumbing, toGitError, wrapGitError } from './gitErrorClassification.ts';

/** The one line `ls ""` prints, the root tree of the program; the empty path's tab may be trimmed. */
const ROOT_LINE = /^040000 tree ([0-9a-f]{40}|[0-9a-f]{64})\t?$/u;
/** Fast-import ran but its output is not the one root line the script asks for. */
export const E_FAST_IMPORT_PROTOCOL = 'E_FAST_IMPORT_PROTOCOL';
/** Random bytes in each staging commit's message: enough that no two programs write the same commit. */
const NONCE_BYTES = 16;

/**
 * Runs a `GitFastImportTreeScript` as one `git fast-import` process and
 * returns the id of the tree it built. Every object the script creates is
 * written by that process; nothing else is spawned.
 *
 * Fast-import keeps an object that it finds in any pack, a cruft pack too,
 * and does not refresh its age. A program that rebuilds old garbage, such as
 * a cone head rebuilt after it was deleted, so gets back an old tree that no
 * ref names yet and a GC may delete (#1110, #1127). Each program therefore
 * writes its staging commit with a random message: that commit is always a
 * new object, and it names the root. Git keeps an object newer than the prune
 * date with everything it reaches (git-gc(1), NOTES), so a GC with a prune
 * date in the past that selects what to delete after the process ends keeps
 * the tree until a ref names it. A GC that selects while the process runs is
 * not covered: the new commit is not visible to it until the process ends.
 */
export default class GitFastImportTreeWriter {
  readonly #plumbing: Pick<GitPlumbing, 'execute'>;
  readonly #random: RandomPort;

  constructor(options: { readonly plumbing: Pick<GitPlumbing, 'execute'>; readonly random: RandomPort }) {
    this.#plumbing = options.plumbing;
    this.#random = options.random;
  }

  async write(script: GitFastImportTreeScript): Promise<string> {
    const program = script.encode(textEncode(hexEncode(this.#random.randomBytes(NONCE_BYTES))));
    let output: string;
    try {
      output = await this.#plumbing.execute({ args: ['fast-import', '--quiet', '--done'], input: Buffer.from(program) });
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
