/**
 * Writer - WARP writer abstraction for safe graph mutations.
 *
 * A Writer is the only way to mutate a WarpRuntime state. It owns a writerId
 * and maintains a single-writer chain under refs/warp/<graph>/writers/<writerId>.
 *
 * Key guarantees:
 * - Single-writer chain per writerId
 * - Ref-safe identity
 * - CAS-based updates to prevent concurrent forks
 * - Schema:2 only (Patch ops with OR-Set semantics)
 *
 * @module domain/warp/Writer
 * @see WARP Writer Spec v1
 */

import nullLogger from '../utils/nullLogger.ts';
import { validateWriterId, buildWriterRef } from '../utils/RefLayout.ts';
import { PatchSession } from './PatchSession.ts';
import { PatchBuilder } from '../services/PatchBuilder.ts';
import { requireCommitMessageCodec } from '../services/codec/CommitMessageCodecRequirement.ts';
import WriterError from '../errors/WriterError.ts';
import type VersionVector from '../crdt/VersionVector.ts';
import type Patch from '../types/Patch.ts';
import type WarpKernelPort from '../../ports/WarpKernelPort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';
import type { WarpState } from '../services/JoinReducer.ts';

// Re-export for backward compatibility — consumers importing from Writer.ts
// should migrate to importing from '../errors/WriterError.ts' directly.
export { WriterError };

/**
 * Asserts that a Lamport timestamp is a valid positive finite integer.
 */
function _assertValidLamport(lamport: number, commitSha: string): void {
  if (typeof lamport !== 'number' || !Number.isFinite(lamport) || lamport < 1) {
    throw new WriterError(
      `Malformed Lamport timestamp in commit ${commitSha}: ${JSON.stringify(lamport)}`, // nosemgrep: ts-no-json-stringify-in-core -- 0025B
      { code: 'E_LAMPORT_CORRUPT' },
    );
  }
}

/** Validates that a PatchJournalPort is provided. */
function _validateJournal(patchJournal: PatchJournalPort): void {
  if (patchJournal === null || patchJournal === undefined) {
    throw new WriterError(
      'patchJournal is required — Writer.beginPatch() produces patches that must be persisted via a PatchJournalPort.',
      { code: 'E_MISSING_JOURNAL' },
    );
  }
}

type OnDeleteWithData = 'reject' | 'cascade' | 'warn';

interface WriterOptions {
  persistence: WarpKernelPort;
  graphName: string;
  writerId: string;
  versionVector: VersionVector;
  getCurrentState: () => WarpState | null;
  onCommitSuccess?: (result: { patch: Patch; sha: string }) => void | Promise<void>;
  onDeleteWithData?: OnDeleteWithData;
  patchJournal: PatchJournalPort;
  commitMessageCodec?: CommitMessageCodecPort;
  logger?: LoggerPort;
  assetStorage?: AssetStoragePort;
}

/**
 * Writer class for creating and committing patches to a WARP graph.
 */
export class Writer {
  private _persistence: WarpKernelPort;
  private _graphName: string;
  private _writerId: string;
  private _versionVector: VersionVector;
  private _getCurrentState: () => WarpState | null;
  private _onCommitSuccess: ((result: { patch: Patch; sha: string }) => void | Promise<void>) | undefined;
  private _onDeleteWithData: OnDeleteWithData;
  private _patchJournal: PatchJournalPort;
  private _commitMessageCodec: CommitMessageCodecPort;
  private _logger: LoggerPort;
  private _assetStorage: AssetStoragePort | null;
  private _commitInProgress: boolean;

  constructor(opts: WriterOptions) {
    validateWriterId(opts.writerId);
    _validateJournal(opts.patchJournal);
    this._persistence = opts.persistence;
    this._graphName = opts.graphName;
    this._writerId = opts.writerId;
    this._versionVector = opts.versionVector;
    this._getCurrentState = opts.getCurrentState;
    this._onCommitSuccess = opts.onCommitSuccess;
    this._onDeleteWithData = opts.onDeleteWithData ?? 'warn';
    this._patchJournal = opts.patchJournal;
    this._commitMessageCodec = requireCommitMessageCodec(opts.commitMessageCodec);
    this._logger = opts.logger ?? nullLogger;
    this._assetStorage = opts.assetStorage ?? null;
    this._commitInProgress = false;
  }

  /** Gets the writer ID. */
  get writerId(): string {
    return this._writerId;
  }

  /** Gets the graph name. */
  get graphName(): string {
    return this._graphName;
  }

  /**
   * Gets the current writer head SHA.
   *
   * @returns The tip SHA or null if no commits yet
   */
  async head(): Promise<string | null> {
    const writerRef = buildWriterRef(this._graphName, this._writerId);
    return await this._persistence.readRef(writerRef);
  }

  /**
   * Begins a new patch session.
   *
   * Reads the current writer head and captures it as the expected parent
   * for CAS-based commit.
   */
  async beginPatch(): Promise<PatchSession> {
    const persistence = this._persistence;
    const graphName = this._graphName;
    const writerId = this._writerId;
    const writerRef = buildWriterRef(graphName, writerId);
    const expectedOldHead = await persistence.readRef(writerRef);
    const lamport = await this._resolveNextLamport(expectedOldHead);

    const builderOpts = this._buildPatchOpts({ persistence, graphName, writerId, lamport, expectedParentSha: expectedOldHead });
    const builder = new PatchBuilder(builderOpts);

    return new PatchSession({ builder, persistence, graphName, writerId, expectedOldHead });
  }

  /**
   * Constructs PatchBuilder options from Writer state.
   */
  private _buildPatchOpts(core: {
    persistence: WarpKernelPort;
    graphName: string;
    writerId: string;
    lamport: number;
    expectedParentSha: string | null;
  }): ConstructorParameters<typeof PatchBuilder>[0] {
    const opts: ConstructorParameters<typeof PatchBuilder>[0] = {
      ...core,
      versionVector: this._versionVector.clone(),
      getCurrentState: this._getCurrentState,
      onDeleteWithData: this._onDeleteWithData,
      patchJournal: this._patchJournal,
      commitMessageCodec: this._commitMessageCodec,
      logger: this._logger,
    };
    if (this._onCommitSuccess) { opts.onCommitSuccess = this._onCommitSuccess; }
    if (this._assetStorage) { opts.assetStorage = this._assetStorage; }
    return opts;
  }

  /**
   * Reads the previous commit's Lamport timestamp and returns the next value.
   */
  private async _resolveNextLamport(headSha: string | null | undefined): Promise<number> {
    if (headSha === null || headSha === undefined) {
      return 1;
    }
    const commitMessage = await this._persistence.showNode(headSha);
    if (this._commitMessageCodec.detectKind(commitMessage) !== 'patch') {
      return 1;
    }
    const { lamport } = this._commitMessageCodec.decodePatch(commitMessage);
    _assertValidLamport(lamport, headSha);
    return lamport + 1;
  }

  /**
   * Convenience method to build and commit a patch in one call.
   */
  async commitPatch(build: (p: PatchSession) => void | Promise<void>): Promise<string> {
    if (this._commitInProgress) {
      throw new WriterError(
        'commitPatch() is not reentrant. Use beginPatch() for nested or concurrent patches.',
        { code: 'COMMIT_IN_PROGRESS' },
      );
    }
    this._commitInProgress = true;
    try {
      const patch = await this.beginPatch();
      await build(patch);
      return await patch.commit();
    } finally {
      this._commitInProgress = false;
    }
  }
}
