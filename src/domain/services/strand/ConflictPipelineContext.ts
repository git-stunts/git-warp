/**
 * ConflictPipelineContext — explicit dependencies for conflict analysis stages.
 *
 * Conflict pipeline modules receive this narrow context instead of the
 * ConflictAnalyzerService orchestrator.
 *
 * @module domain/services/strand/ConflictPipelineContext
 */

import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import type Patch from '../../types/Patch.ts';
import type { HashablePayload } from '../../types/conflict/HashablePayload.ts';
import type { StrandCoordinatorGraphRuntime } from './createStrandCoordinator.ts';

export type ConflictPipelineGraphRuntime = StrandCoordinatorGraphRuntime & {
  _loadWriterPatches(writerId: string): Promise<Array<{ patch: Patch; sha: string }>>;
};

export default class ConflictPipelineContext {
  readonly graph: ConflictPipelineGraphRuntime;
  private readonly _digestCache: Map<string, string>;

  constructor({
    graph,
  }: {
    graph: ConflictPipelineGraphRuntime;
  }) {
    this.graph = graph;
    this._digestCache = new Map();
    Object.freeze(this);
  }

  async hash(payload: HashablePayload): Promise<string> {
    const canonical = canonicalStringify(payload);
    const cached = this._digestCache.get(canonical);
    if (cached !== undefined) {
      return cached;
    }
    const digest = await this.graph._crypto.hash('sha256', canonical);
    this._digestCache.set(canonical, digest);
    return digest;
  }
}
