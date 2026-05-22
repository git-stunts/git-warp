import { describe, expect, it } from 'vitest';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import nullLogger from '../../../../src/domain/utils/nullLogger.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import { commitPatch, type CommitState } from '../../../../src/domain/services/PatchCommitter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/domain/services/codec/WarpMessageCodec.ts';
import CommitPort, {
  type CommitLogChunk,
  type CommitNodeOptions,
  type CommitNodeWithTreeOptions,
  type LogNodesOptions,
  type NodeInfo,
  type PingResult,
} from '../../../../src/ports/CommitPort.ts';
import type BlobPort from '../../../../src/ports/BlobPort.ts';
import type TreePort from '../../../../src/ports/TreePort.ts';
import type RefPort from '../../../../src/ports/RefPort.ts';
import type { ListRefsOptions } from '../../../../src/ports/RefPort.ts';
import PatchJournalPort, { type ReadPatchOptions } from '../../../../src/ports/PatchJournalPort.ts';
import type PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';

const PATCH_OID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TREE_OID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const COMMIT_OID = 'cccccccccccccccccccccccccccccccccccccccc';
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

class InvisibleWriterRefPersistence extends CommitPort implements BlobPort, TreePort, RefPort {
  readonly updateRefs: string[] = [];
  readonly committedTrees: CommitNodeWithTreeOptions[] = [];

  async commitNode(_options: CommitNodeOptions): Promise<string> {
    throw unusedPortMethod('commitNode');
  }

  async showNode(_sha: string): Promise<string> {
    throw unusedPortMethod('showNode');
  }

  async getNodeInfo(_sha: string): Promise<NodeInfo> {
    throw unusedPortMethod('getNodeInfo');
  }

  async logNodes(_options: LogNodesOptions): Promise<string> {
    throw unusedPortMethod('logNodes');
  }

  async logNodesStream(_options: LogNodesOptions): Promise<WarpStream<CommitLogChunk>> {
    throw unusedPortMethod('logNodesStream');
  }

  async countNodes(_ref: string): Promise<number> {
    throw unusedPortMethod('countNodes');
  }

  async commitNodeWithTree(options: CommitNodeWithTreeOptions): Promise<string> {
    this.committedTrees.push(options);
    return COMMIT_OID;
  }

  async nodeExists(_sha: string): Promise<boolean> {
    return true;
  }

  async getCommitTree(_sha: string): Promise<string> {
    return TREE_OID;
  }

  async ping(): Promise<PingResult> {
    return { ok: true, latencyMs: 0 };
  }

  async writeBlob(_content: Uint8Array | string): Promise<string> {
    return PATCH_OID;
  }

  async readBlob(_oid: string): Promise<Uint8Array> {
    return new Uint8Array();
  }

  async writeTree(_entries: string[]): Promise<string> {
    return TREE_OID;
  }

  async readTree(_treeOid: string): Promise<Record<string, Uint8Array>> {
    return {};
  }

  async readTreeOids(_treeOid: string): Promise<Record<string, string>> {
    return {};
  }

  get emptyTree(): string {
    return EMPTY_TREE;
  }

  async updateRef(ref: string, oid: string): Promise<void> {
    this.updateRefs.push(`${ref}:${oid}`);
  }

  async readRef(_ref: string): Promise<string | null> {
    return null;
  }

  async deleteRef(_ref: string): Promise<void> {
    throw unusedPortMethod('deleteRef');
  }

  async listRefs(_prefix: string, _options?: ListRefsOptions): Promise<string[]> {
    return [];
  }

  async compareAndSwapRef(_ref: string, _newOid: string, _expectedOid: string | null): Promise<void> {
    throw unusedPortMethod('compareAndSwapRef');
  }
}

class CapturingPatchJournal extends PatchJournalPort {
  readonly patches: Patch[] = [];

  async writePatch(patch: Patch): Promise<string> {
    this.patches.push(patch);
    return PATCH_OID;
  }

  async readPatch(_patchOid: string, _options?: ReadPatchOptions): Promise<Patch> {
    throw unusedPortMethod('readPatch');
  }

  scanPatchRange(_writerId: string, _fromSha: string | null, _toSha: string): WarpStream<PatchEntry> {
    throw unusedPortMethod('scanPatchRange');
  }
}

function unusedPortMethod(methodName: string): PersistenceError {
  return new PersistenceError(`Unexpected ${methodName} call`, PersistenceError.E_REF_IO);
}

function makeCommitState(
  persistence: InvisibleWriterRefPersistence,
  patchJournal: CapturingPatchJournal,
  onCommitSuccess: CommitState['onCommitSuccess'],
): CommitState {
  return {
    persistence,
    graphName: 'visibility-graph',
    writerId: 'writer-a',
    lamport: 1,
    vv: VersionVector.empty(),
    ops: [new NodeAdd('node:a', Dot.create('writer-a', 1))],
    observedOperands: new Set(),
    writes: new Set(['node:a']),
    hasEdgeProps: false,
    expectedParentSha: null,
    targetRefPath: null,
    contentBlobs: [],
    patchJournal,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    logger: nullLogger,
    onCommitSuccess,
  };
}

describe('commitPatch writer-ref visibility contract', () => {
  it('rejects when updateRef resolves but the new commit is not visible at the writer ref', async () => {
    const persistence = new InvisibleWriterRefPersistence();
    const patchJournal = new CapturingPatchJournal();
    let successCallbackCount = 0;

    await expect(commitPatch(makeCommitState(
      persistence,
      patchJournal,
      () => { successCallbackCount += 1; },
    ))).rejects.toMatchObject({
      code: PersistenceError.E_REF_IO,
    });

    expect(patchJournal.patches).toHaveLength(1);
    expect(persistence.committedTrees).toHaveLength(1);
    expect(persistence.updateRefs).toEqual([
      `refs/warp/visibility-graph/writers/writer-a:${COMMIT_OID}`,
    ]);
    expect(successCallbackCount).toBe(0);
  });
});
