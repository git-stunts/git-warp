import VersionVector from '../crdt/VersionVector.ts';
import PatchError from '../errors/PatchError.ts';
import EdgeAdd from '../types/ops/EdgeAdd.ts';
import NodeAdd from '../types/ops/NodeAdd.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import type Patch from '../types/Patch.ts';

type WriterHeadContextRequest = Readonly<{
  commits: { showNode(sha: string): Promise<string> };
  codec: CommitMessageCodecPort;
  journal: PatchJournalPort | null | undefined;
  headSha: string | null;
}>;

/** Head patch context plus its add dots, read by SHA (fork heads belong to other writers), so new dots never repeat (#995). */
export default async function readWriterHeadContext(request: WriterHeadContextRequest): Promise<VersionVector> {
  const { commits, codec, headSha } = request;
  if (headSha === null) { return VersionVector.empty(); }
  const message = await commits.showNode(headSha);
  if (codec.detectKind(message) !== 'patch') { return VersionVector.empty(); }
  const patch = await requireJournal(request.journal).readPatch(codec.decodePatch(message));
  return withAddDots(patch);
}

function requireJournal(journal: PatchJournalPort | null | undefined): PatchJournalPort {
  if (journal === null || journal === undefined) {
    throw new PatchError('A patch journal is required to continue an existing writer', { code: 'E_MISSING_JOURNAL' });
  }
  return journal;
}

function withAddDots(patch: Patch): VersionVector {
  const context = VersionVector.from(patch.context);
  for (const op of patch.ops) {
    if (op instanceof NodeAdd || op instanceof EdgeAdd) {
      context.set(op.dot.writerId, Math.max(context.get(op.dot.writerId) ?? 0, op.dot.counter));
    }
  }
  return context;
}
