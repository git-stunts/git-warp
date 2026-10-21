import DotMint from '../crdt/DotMint.ts';
import VersionVector from '../crdt/VersionVector.ts';
import PatchError from '../errors/PatchError.ts';
import EdgeAdd from '../types/ops/EdgeAdd.ts';
import NodeAdd from '../types/ops/NodeAdd.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import type Patch from '../types/Patch.ts';

type DotMintRequest = Readonly<{
  writerId: string;
  commits: { showNode(sha: string): Promise<string> };
  codec: CommitMessageCodecPort;
  journal: PatchJournalPort | null | undefined;
  headSha: string | null;
}>;

/**
 * Opens the dot mint for a writer chain at `headSha`.
 *
 * The head is read by SHA because a forked chain's first head belongs to
 * another writer. The mint continues above the head context and every add
 * dot the head used, so new dots never repeat (#995).
 */
export default async function openDotMint(request: DotMintRequest): Promise<DotMint> {
  const { writerId, commits, codec, headSha } = request;
  if (headSha === null) { return DotMint.after(writerId, 0); }
  const message = await commits.showNode(headSha);
  if (codec.detectKind(message) !== 'patch') { return DotMint.after(writerId, 0); }
  const patch = await requireJournal(request.journal).readPatch(codec.decodePatch(message));
  return DotMint.after(writerId, highWaterMark(patch, writerId));
}

/** Mints above every dot `writerId` used in already-loaded patches. */
export function dotMintAfterPatches(writerId: string, patches: Iterable<{ readonly patch: Patch }>): DotMint {
  let issued = 0;
  for (const { patch } of patches) { issued = Math.max(issued, highWaterMark(patch, writerId)); }
  return DotMint.after(writerId, issued);
}

function requireJournal(journal: PatchJournalPort | null | undefined): PatchJournalPort {
  if (journal === null || journal === undefined) {
    throw new PatchError('A patch journal is required to continue an existing writer', { code: 'E_MISSING_JOURNAL' });
  }
  return journal;
}

function highWaterMark(patch: Patch, writerId: string): number {
  let issued = VersionVector.from(patch.context).get(writerId) ?? 0;
  for (const op of patch.ops) {
    issued = Math.max(issued, ownAddCounter(op, writerId));
  }
  return issued;
}

function ownAddCounter(op: Patch['ops'][number], writerId: string): number {
  if (!(op instanceof NodeAdd || op instanceof EdgeAdd)) { return 0; }
  return op.dot.writerId === writerId ? op.dot.counter : 0;
}
