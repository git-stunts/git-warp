/**
 * PatchSession - Fluent patch builder with CAS-safe commit.
 *
 * A PatchSession is created by Writer.beginPatch() and provides a fluent API
 * for building graph mutations. The commit uses compare-and-swap semantics
 * to prevent concurrent forks of the writer chain.
 *
 * @module domain/warp/PatchSession
 * @see WARP Writer Spec v1
 */

import WriterError from '../errors/WriterError.ts';
import { buildWriterRef } from '../utils/RefLayout.ts';
import type { PatchBuilder } from '../services/PatchBuilder.ts';
import type RefPort from '../../ports/RefPort.ts';
import type Patch from '../types/Patch.ts';

const NONE_DISPLAY = '(none)';

/**
 * Extracts the error message and cause from an unknown error value.
 */
function _extractErrorInfo(err: unknown): { errMsg: string; cause: Error | undefined } {
  const errMsg = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? err : undefined;
  return { errMsg, cause };
}

/**
 * Extracts the CAS error object from an unknown error if applicable.
 */
function _extractCasError(err: unknown): { code?: unknown; expectedSha?: unknown; actualSha?: unknown } | null {
  if (err !== null && err !== undefined && typeof err === 'object') {
    return err as { code?: unknown; expectedSha?: unknown; actualSha?: unknown };
  }
  return null;
}

/** Formats a nullable SHA for display in error messages. */
function _displaySha(sha: string | null): string {
  return (sha !== null && sha.length > 0) ? sha : NONE_DISPLAY;
}

interface CommitContext {
  graphName: string;
  writerId: string;
  expectedOldHead: string | null;
}

/**
 * Builds a CAS conflict WriterError with ref details.
 */
function _buildCasConflictError(
  casError: { code?: unknown; expectedSha?: unknown; actualSha?: unknown },
  cause: Error | undefined,
  ctx: CommitContext,
): WriterError {
  const { graphName, writerId, expectedOldHead } = ctx;
  const writerRef = buildWriterRef(graphName, writerId);
  const expectedSha = typeof casError.expectedSha === 'string' ? casError.expectedSha : expectedOldHead;
  const actualSha = typeof casError.actualSha === 'string' ? casError.actualSha : null;
  return new WriterError(
    'WRITER_REF_ADVANCED',
    `Writer ref ${writerRef} has advanced since beginPatch(). ` +
    `Expected ${_displaySha(expectedSha)}, found ${_displaySha(actualSha)}. ` +
    'Call beginPatch() again to retry.',
    cause,
  );
}

/**
 * Classifies a commit error into the appropriate WriterError code.
 */
function _classifyCommitError(err: unknown, ctx: CommitContext): WriterError {
  const { errMsg, cause } = _extractErrorInfo(err);
  const casError = _extractCasError(err);
  if (casError !== null && casError.code === 'WRITER_CAS_CONFLICT') {
    return _buildCasConflictError(casError, cause, ctx);
  }
  if (errMsg.includes('Concurrent commit detected') || errMsg.includes('has advanced')) {
    return new WriterError('WRITER_REF_ADVANCED', errMsg, cause);
  }
  return new WriterError('PERSIST_WRITE_FAILED', `Failed to persist patch: ${errMsg}`, cause);
}

interface PatchSessionOptions {
  builder: PatchBuilder;
  persistence: RefPort;
  graphName: string;
  writerId: string;
  expectedOldHead: string | null;
}

/**
 * Fluent patch session for building and committing graph mutations.
 */
export class PatchSession {
  private _builder: PatchBuilder;
  private _graphName: string;
  private _writerId: string;
  private _expectedOldHead: string | null;
  private _committed: boolean;

  constructor({ builder, persistence: _persistence, graphName, writerId, expectedOldHead }: PatchSessionOptions) {
    this._builder = builder;
    this._graphName = graphName;
    this._writerId = writerId;
    this._expectedOldHead = expectedOldHead;
    this._committed = false;
  }

  /**
   * Gets the expected old head SHA (for testing).
   * @internal
   */
  get _expectedOldHeadForTest(): string | null {
    return this._expectedOldHead;
  }

  /** Adds a node to the graph. */
  addNode(nodeId: string): this {
    this._ensureNotCommitted();
    this._builder.addNode(nodeId);
    return this;
  }

  /**
   * Removes a node from the graph.
   * Uses observed dots from materialized state for OR-Set removal.
   */
  removeNode(nodeId: string): this {
    this._ensureNotCommitted();
    this._builder.removeNode(nodeId);
    return this;
  }

  /** Adds an edge between two nodes. */
  addEdge(from: string, to: string, label: string): this {
    this._ensureNotCommitted();
    this._builder.addEdge(from, to, label);
    return this;
  }

  /**
   * Removes an edge between two nodes.
   * Uses observed dots from materialized state for OR-Set removal.
   */
  removeEdge(from: string, to: string, label: string): this {
    this._ensureNotCommitted();
    this._builder.removeEdge(from, to, label);
    return this;
  }

  /** Sets a property on a node. */
  setProperty(nodeId: string, key: string, value: unknown): this {
    this._ensureNotCommitted();
    this._builder.setProperty(nodeId, key, value);
    return this;
  }

  /** Sets a property on an edge. */
  setEdgeProperty(from: string, to: string, label: string, key: string, value: unknown): this {
    this._ensureNotCommitted();
    this._builder.setEdgeProperty(from, to, label, key, value);
    return this;
  }

  /** Attaches content to a node. */
  async attachContent(nodeId: string, content: Uint8Array | string, metadata?: { mime?: string | null; size?: number | null }): Promise<this> {
    this._ensureNotCommitted();
    await this._builder.attachContent(nodeId, content, metadata);
    return this;
  }

  /** Clears content from a node. */
  clearContent(nodeId: string): this {
    this._ensureNotCommitted();
    this._builder.clearContent(nodeId);
    return this;
  }

  /** Attaches content to an edge. */
  async attachEdgeContent(from: string, to: string, label: string, content: Uint8Array | string, metadata?: { mime?: string | null; size?: number | null }): Promise<this> {
    this._ensureNotCommitted();
    await this._builder.attachEdgeContent(from, to, label, content, metadata);
    return this;
  }

  /** Clears content from an edge. */
  clearEdgeContent(from: string, to: string, label: string): this {
    this._ensureNotCommitted();
    this._builder.clearEdgeContent(from, to, label);
    return this;
  }

  /** Builds the Patch object without committing. */
  build(): Patch {
    return this._builder.build();
  }

  /**
   * Commits the patch to the graph with CAS protection.
   *
   * @returns The commit SHA of the new patch
   */
  async commit(): Promise<string> {
    this._ensureNotCommitted();
    this._ensureNotEmpty();

    try {
      const sha = await this._builder.commit();
      this._committed = true;
      return sha;
    } catch (err) {
      throw _classifyCommitError(err, { graphName: this._graphName, writerId: this._writerId, expectedOldHead: this._expectedOldHead });
    }
  }

  /** Ensures the patch has at least one operation. */
  private _ensureNotEmpty(): void {
    if (this._builder.ops.length === 0) {
      throw new WriterError('EMPTY_PATCH', 'Cannot commit empty patch: no operations added');
    }
  }

  /** Gets the number of operations in this patch. */
  get opCount(): number {
    return this._builder.ops.length;
  }

  /** Ensures the session hasn't been committed yet. */
  private _ensureNotCommitted(): void {
    if (this._committed) {
      throw new WriterError(
        'SESSION_COMMITTED',
        'PatchSession already committed. Call beginPatch() to create a new session.',
      );
    }
  }
}
