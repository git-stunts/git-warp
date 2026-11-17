import { Buffer } from 'node:buffer';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import { type FrontierAnchor, FRONTIER_ANCHOR_IDENTITY } from './FrontierAnchorPlan.ts';
import { E_FAST_IMPORT_PROTOCOL } from './GitFastImportTreeWriter.ts';
import { type GitPlumbing, toGitError, wrapGitError } from './gitErrorClassification.ts';

/**
 * The branch fast-import builds anchors on. It is reset before every anchor, so each anchor
 * has only the parents it names, and reset again at the end, so no ref is ever written.
 */
const SCRATCH_BRANCH = 'refs/warp-local/frontier-anchor-build';
/**
 * Anchors one process writes: with the empty tree, well below fast-import's default unpack
 * limit of 100 objects, so Git stores them as loose objects. Two processes that write the
 * same anchors at once then both succeed; as a pack, the second would find the first's keep
 * file and fail. A lowered `fastimport.unpackLimit` or `transfer.unpackLimit` makes
 * fast-import write a pack and reopens that race (7 failures in 100 races under a global
 * `transfer.unpackLimit=1` in a review run): the losing write throws before it publishes,
 * and nothing is corrupted. The plumbing gives no way to set the limit per process: it
 * refuses `-c` and `GIT_CONFIG_*`, and allows `fast-import` only `--quiet` and `--done`.
 */
export const FAST_IMPORT_ANCHOR_BATCH = 64;
const encoder = new TextEncoder();

/**
 * Writes frontier anchor commits through `git fast-import` (#1197), one process for each
 * {@link FAST_IMPORT_ANCHOR_BATCH} anchors. Each commit has exactly the parents, identity
 * and message its anchor states, and the empty tree, so Git gives it the id the anchor
 * already names; a different id is a protocol fault. An anchor may name one written
 * earlier in the same call. Nothing else is spawned.
 */
export default class GitFastImportCommitWriter {
  readonly #plumbing: Pick<GitPlumbing, 'execute'>;

  constructor(options: { readonly plumbing: Pick<GitPlumbing, 'execute'> }) {
    this.#plumbing = options.plumbing;
  }

  async write(anchors: readonly FrontierAnchor[]): Promise<void> {
    for (let start = 0; start < anchors.length; start += FAST_IMPORT_ANCHOR_BATCH) {
      await this.#writeBatch(anchors.slice(start, start + FAST_IMPORT_ANCHOR_BATCH));
    }
  }

  /** One process; an anchor written by an earlier batch is named by its id. */
  async #writeBatch(anchors: readonly FrontierAnchor[]): Promise<void> {
    const marks = new Map(anchors.map((anchor, index) => [anchor.oid, `:${index + 1}`]));
    const commands = anchors.map((anchor, index) => commitCommand(anchor, index + 1, marks));
    const reads = anchors.map((_anchor, index) => `get-mark :${index + 1}\n`);
    const script = `${commands.join('')}reset ${SCRATCH_BRANCH}\n\n${reads.join('')}done\n`;
    let output: string;
    try {
      output = await this.#plumbing.execute({ args: ['fast-import', '--quiet', '--done'], input: Buffer.from(script) });
    } catch (raw) {
      throw wrapGitError(toGitError(raw), {});
    }
    requireIds(output, anchors);
  }
}

/** One commit: its own mark, the fixed identity, its message, then its parents in order on an emptied tree. */
function commitCommand(anchor: FrontierAnchor, mark: number, marks: ReadonlyMap<string, string>): string {
  const [first = '', ...rest] = anchor.parents.map((parent) => marks.get(parent) ?? parent);
  return [
    `reset ${SCRATCH_BRANCH}`,
    `commit ${SCRATCH_BRANCH}`,
    `mark :${mark}`,
    `author ${FRONTIER_ANCHOR_IDENTITY}`,
    `committer ${FRONTIER_ANCHOR_IDENTITY}`,
    `data ${encoder.encode(anchor.message).length}`,
    anchor.message,
    `from ${first}`,
    ...rest.map((parent) => `merge ${parent}`),
    'deleteall',
    '',
    '',
  ].join('\n');
}

/** Git must name every commit with the id the anchor computed: anything else would retain other history. */
function requireIds(output: string, anchors: readonly FrontierAnchor[]): void {
  const written = output.split('\n').filter((line) => line !== '');
  const expected = anchors.map((anchor) => anchor.oid);
  if (written.length !== expected.length || written.some((oid, index) => oid !== expected[index])) {
    throw new PersistenceError(`git fast-import wrote anchors with other ids: ${written.join(' ')}`, E_FAST_IMPORT_PROTOCOL);
  }
}
