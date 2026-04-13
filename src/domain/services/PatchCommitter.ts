/**
 * PatchCommitter — persistence pipeline for committing a built patch.
 *
 * Extracted from PatchBuilder to keep file sizes under 500 LOC.
 * Handles: CAS race detection, lamport resolution, blob persistence,
 * tree construction, commit creation, ref update, and success callback.
 *
 * @module domain/services/PatchCommitter
 */

import VersionVector from '../crdt/VersionVector.ts';
import Patch from '../types/Patch.ts';
import { lowerCanonicalOp } from './OpNormalizer.ts';
import { encodePatchMessage, decodePatchMessage, detectMessageKind } from './codec/WarpMessageCodec.ts';
import { buildWriterRef } from '../utils/RefLayout.ts';
import WriterError from '../errors/WriterError.ts';
import PatchError from '../errors/PatchError.ts';
import PersistenceError from '../errors/PersistenceError.ts';
import type { OpV2, CanonicalOpV2 } from '../types/ops/unions.ts';
import type CommitPort from '../../ports/CommitPort.ts';
import type BlobPort from '../../ports/BlobPort.ts';
import type TreePort from '../../ports/TreePort.ts';
import type RefPort from '../../ports/RefPort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';

type PersistencePorts = CommitPort & BlobPort & TreePort & RefPort;

export type CommitState = {
  persistence: PersistencePorts;
  graphName: string;
  writerId: string;
  lamport: number;
  vv: VersionVector;
  ops: OpV2[];
  observedOperands: Set<string>;
  writes: Set<string>;
  hasEdgeProps: boolean;
  expectedParentSha: string | null;
  targetRefPath: string | null;
  contentBlobs: string[];
  patchJournal: PatchJournalPort | null;
  logger: LoggerPort;
  onCommitSuccess: ((result: { patch: Patch; sha: string }) => void | Promise<void>) | null;
};

/**
 * Commits a patch built by PatchBuilder to the Git object store.
 *
 * Steps: CAS check → lamport resolution → build Patch → persist blob →
 * build tree → create commit → update ref → invoke callback.
 */
export async function commitPatch(state: CommitState): Promise<string> {
  if (state.ops.length === 0) {
    throw new PatchError('Cannot commit empty patch: no operations added', { code: 'E_PATCH_EMPTY' });
  }

  // CAS: check if writer ref has advanced since builder creation
  const writerRef = (state.targetRefPath !== null && state.targetRefPath !== '')
    ? state.targetRefPath
    : buildWriterRef(state.graphName, state.writerId);
  const currentRefSha = await state.persistence.readRef(writerRef);

  if (currentRefSha !== state.expectedParentSha) {
    const err = new WriterError(
      'WRITER_CAS_CONFLICT',
      'Commit failed: writer ref was updated by another process. Re-materialize and retry.',
    ) as WriterError & { expectedSha: string | null; actualSha: string | null };
    err.expectedSha = state.expectedParentSha;
    err.actualSha = currentRefSha;
    throw err;
  }

  // Lamport resolution from parent chain
  let {lamport} = state;
  let parentCommit: string | null = null;

  if (currentRefSha !== null && currentRefSha !== undefined && currentRefSha !== '') {
    parentCommit = currentRefSha;
    const commitMessage = await state.persistence.showNode(currentRefSha);
    const kind = detectMessageKind(commitMessage);

    if (kind === 'patch') {
      let patchInfo;
      try {
        patchInfo = decodePatchMessage(commitMessage);
      } catch (err) {
        throw new PatchError(
          `Failed to parse lamport from writer ref ${writerRef}: ` +
          `commit ${currentRefSha} has invalid patch message format`,
          {
            code: 'E_PATCH_LAMPORT_PARSE',
            context: { writerRef, currentRefSha, cause: err instanceof Error ? err.message : String(err) },
          },
        );
      }
      lamport = Math.max(state.lamport, patchInfo.lamport + 1);
    }
  }

  // Build Patch
  const schema = state.hasEdgeProps ? 3 : 2;
  const rawOps = state.ops.map((op) => lowerCanonicalOp(op as CanonicalOpV2));
  const patch = new Patch({
    schema,
    writer: state.writerId,
    lamport,
    context: VersionVector.serialize(state.vv),
    ops: rawOps,
    reads: [...state.observedOperands].sort(),
    writes: [...state.writes].sort(),
  });

  // Persist patch blob
  if (state.patchJournal === null || state.patchJournal === undefined) {
    throw new PersistenceError('patchJournal is required for committing patches', 'E_MISSING_JOURNAL');
  }
  const patchBlobOid = await state.patchJournal.writePatch(patch);

  // Build tree with patch blob + content blobs
  const treeEntries = [`100644 blob ${patchBlobOid}\tpatch.cbor`];
  const uniqueBlobs = [...new Set(state.contentBlobs)];
  for (const blobOid of uniqueBlobs) {
    treeEntries.push(`040000 tree ${blobOid}\t_content_${blobOid}`);
  }
  const treeOid = await state.persistence.writeTree(treeEntries);

  // Create commit
  const message = encodePatchMessage({
    graph: state.graphName,
    writer: state.writerId,
    lamport,
    patchOid: patchBlobOid,
    schema,
    encrypted: state.patchJournal.usesExternalStorage,
  });
  const parents = (parentCommit !== null && parentCommit !== '') ? [parentCommit] : [];
  const newCommitSha = await state.persistence.commitNodeWithTree({
    treeOid, parents, message,
  });

  // Update writer ref
  await state.persistence.updateRef(writerRef, newCommitSha);

  // Invoke success callback
  if (state.onCommitSuccess) {
    try {
      await state.onCommitSuccess({ patch, sha: newCommitSha });
    } catch (err) {
      state.logger.warn(`[warp] onCommitSuccess callback failed (sha=${newCommitSha}):`, { error: err });
    }
  }

  return newCommitSha;
}
