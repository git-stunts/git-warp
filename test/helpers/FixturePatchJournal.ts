import PatchEntry from '../../src/domain/artifacts/PatchEntry.ts';
import SyncError from '../../src/domain/errors/SyncError.ts';
import WarpStream from '../../src/domain/stream/WarpStream.ts';
import type Patch from '../../src/domain/types/Patch.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import type CommitMessageCodecPort from '../../src/ports/CommitMessageCodecPort.ts';
import type { PatchCommitMessage } from '../../src/ports/CommitMessageCodecPort.ts';
import PatchJournalPort from '../../src/ports/PatchJournalPort.ts';
import type {
  AppendPatchRequest,
  PublishedPatch,
} from '../../src/ports/PatchJournalPort.ts';

export type FixturePatchCommit = Readonly<{
  message: string;
  parents: readonly string[];
}>;

/** Semantic patch history fixture for sync tests. */
export default class FixturePatchJournal extends PatchJournalPort {
  readonly #commits: Readonly<Record<string, FixturePatchCommit>>;
  readonly #patches: Readonly<Record<string, Patch>>;
  readonly #messageCodec: CommitMessageCodecPort;

  constructor(options: {
    readonly commits: Readonly<Record<string, FixturePatchCommit>>;
    readonly patches: Readonly<Record<string, Patch>>;
    readonly messageCodec?: CommitMessageCodecPort;
  }) {
    super();
    this.#commits = options.commits;
    this.#patches = options.patches;
    this.#messageCodec = options.messageCodec ?? DEFAULT_COMMIT_MESSAGE_CODEC;
  }

  override appendPatch(_request: AppendPatchRequest): Promise<PublishedPatch> {
    throw new Error('FixturePatchJournal does not publish patches');
  }

  override readPatch(message: PatchCommitMessage): Promise<Patch> {
    const handle = message.patchHandle.toString();
    const patch = this.#patches[handle];
    if (patch === undefined) {
      throw new Error(`Fixture patch not found: ${handle}`);
    }
    return Promise.resolve(patch);
  }

  override scanPatchRange(
    _writerId: string,
    fromSha: string | null,
    toSha: string,
  ): WarpStream<PatchEntry> {
    const journal = this;
    return WarpStream.from((async function* (): AsyncGenerator<PatchEntry> {
      const reverse: Array<{ readonly sha: string; readonly message: PatchCommitMessage }> = [];
      let current: string | null = toSha;
      while (current !== null && current !== fromSha) {
        const commit: FixturePatchCommit | undefined = journal.#commits[current];
        if (commit === undefined) {
          throw new Error(`Fixture commit not found: ${current}`);
        }
        if (journal.#messageCodec.detectKind(commit.message) !== 'patch') {
          break;
        }
        reverse.push({ sha: current, message: journal.#messageCodec.decodePatch(commit.message) });
        current = commit.parents[0] ?? null;
      }
      if (fromSha !== null && current !== fromSha) {
        throw new SyncError(
          `Divergence detected: ${toSha} does not descend from ${fromSha}`,
          { code: 'E_SYNC_DIVERGENCE' },
        );
      }
      for (let index = reverse.length - 1; index >= 0; index -= 1) {
        const entry = reverse[index];
        if (entry !== undefined) {
          yield new PatchEntry({ sha: entry.sha, patch: await journal.readPatch(entry.message) });
        }
      }
    })());
  }
}
