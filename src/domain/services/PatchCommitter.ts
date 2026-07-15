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
import { buildWriterRef } from '../utils/RefLayout.ts';
import WriterError from '../errors/WriterError.ts';
import PatchError from '../errors/PatchError.ts';
import PersistenceError from '../errors/PersistenceError.ts';
import type { PatchOp, CanonicalPatchOp } from '../types/ops/unions.ts';
import type WarpKernelPort from '../../ports/WarpKernelPort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import type { PublishedPatch } from '../../ports/PatchJournalPort.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';
import type AssetHandle from '../storage/AssetHandle.ts';

export type CommitState = {
  persistence: WarpKernelPort;
  graphName: string;
  writerId: string;
  lamport: number;
  vv: VersionVector;
  ops: PatchOp[];
  observedOperands: Set<string>;
  writes: Set<string>;
  hasEdgeProps: boolean;
  expectedParentSha: string | null;
  targetRefPath: string | null;
  contentAssets: AssetHandle[];
  patchJournal: PatchJournalPort | null;
  commitMessageCodec: CommitMessageCodecPort;
  logger: LoggerPort;
  onCommitSuccess: ((result: PatchCommitResult) => void | Promise<void>) | null;
};

export type PatchCommitResult = PublishedPatch & Readonly<{ patch: Patch }>;

/**
 * Commits a patch built by PatchBuilder to the Git object store.
 *
 * Steps: CAS check → lamport resolution → build Patch → persist blob →
 * build tree → create commit → update ref → invoke callback.
 */
export async function commitPatch(state: CommitState): Promise<PatchCommitResult> {
  if (state.ops.length === 0) {
    throw new PatchError('Cannot commit empty patch: no operations added', { code: 'E_PATCH_EMPTY' });
  }

  // CAS: check if writer ref has advanced since builder creation
  const writerRef = (state.targetRefPath !== null && state.targetRefPath !== '')
    ? state.targetRefPath
    : buildWriterRef(state.graphName, state.writerId);
  const currentRefSha = await state.persistence.readRef(writerRef);

  if (currentRefSha !== state.expectedParentSha) {
    throw buildWriterCasConflict(state.expectedParentSha, currentRefSha);
  }

  // Lamport resolution from parent chain
  let {lamport} = state;
  let parentCommit: string | null = null;

  if (currentRefSha !== null && currentRefSha !== undefined && currentRefSha !== '') {
    parentCommit = currentRefSha;
    const commitMessage = await state.persistence.showNode(currentRefSha);
    const kind = state.commitMessageCodec.detectKind(commitMessage);

    if (kind === 'patch') {
      let patchInfo;
      try {
        patchInfo = state.commitMessageCodec.decodePatch(commitMessage);
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
  const rawOps = state.ops.map((op) => lowerCanonicalOp(op as CanonicalPatchOp));
  const patch = new Patch({
    schema,
    writer: state.writerId,
    lamport,
    context: VersionVector.serialize(state.vv),
    ops: rawOps,
    reads: [...state.observedOperands].sort(),
    writes: [...state.writes].sort(),
  });

  // Publish one storage-owned bundle rooted by the causal writer ref.
  if (state.patchJournal === null || state.patchJournal === undefined) {
    throw new PersistenceError('patchJournal is required for committing patches', 'E_MISSING_JOURNAL');
  }
  const published = await publishPatch(
    state,
    state.patchJournal,
    writerRef,
    parentCommit,
    patch,
  );
  const result: PatchCommitResult = Object.freeze({ patch, ...published });

  // Invoke success callback
  if (state.onCommitSuccess) {
    try {
      await state.onCommitSuccess(result);
    } catch (err) {
      const errValue = err instanceof Error ? err : String(err);
      state.logger.warn(`[warp] onCommitSuccess callback failed (sha=${result.sha}):`, { error: errValue });
    }
  }

  return result;
}

async function publishPatch(
  state: CommitState,
  patchJournal: PatchJournalPort,
  writerRef: string,
  parentCommit: string | null,
  patch: Patch,
): Promise<PublishedPatch> {
  try {
    return await patchJournal.appendPatch({
      patch,
      graph: state.graphName,
      writer: state.writerId,
      targetRef: writerRef,
      expectedHead: state.expectedParentSha,
      parent: parentCommit,
      attachments: state.contentAssets,
    });
  } catch (error) {
    return await rethrowPublicationConflict(
      state.persistence,
      writerRef,
      state.expectedParentSha,
      error,
    );
  }
}

/** Builds a WriterError that preserves expected and actual writer-ref heads. */
function buildWriterCasConflict(expectedSha: string | null, actualSha: string | null): WriterError {
  const err = new WriterError(
    'Commit failed: writer ref was updated by another process. Re-materialize and retry.',
    { code: 'WRITER_CAS_CONFLICT' },
  );
  err.expectedSha = expectedSha;
  err.actualSha = actualSha;
  return err;
}

/** Advances a writer ref atomically and translates stale-head failures. */
async function rethrowPublicationConflict(
  persistence: WarpKernelPort,
  writerRef: string,
  expectedSha: string | null,
  error: unknown,
): Promise<never> {
  const actualSha = await persistence.readRef(writerRef);
  if (actualSha !== expectedSha || errorCode(error) === 'PUBLICATION_CONFLICT') {
    throw buildWriterCasConflict(expectedSha, actualSha);
  }
  throw error;
}

function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error;
    return typeof code === 'string' ? code : null;
  }
  return null;
}
