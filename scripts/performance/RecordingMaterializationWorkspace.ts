import type MaterializationHandle
  from '../../src/domain/materialization/MaterializationHandle.ts';
import type { StagePagesOptions }
  from '../../src/ports/ArtifactStagingPort.ts';
import MaterializationWorkspacePort, {
  type MaterializationWorkspaceRoots,
  type PromoteMaterializationRequest,
} from '../../src/ports/MaterializationWorkspacePort.ts';

/** Evidence wrapper that preserves every production workspace capability. */
export default class RecordingMaterializationWorkspace
  extends MaterializationWorkspacePort {
  readonly #delegate: MaterializationWorkspacePort;
  readonly #promote: MaterializationWorkspacePort['promote'];

  constructor(
    delegate: MaterializationWorkspacePort,
    promote: MaterializationWorkspacePort['promote'],
  ) {
    super();
    this.#delegate = delegate;
    this.#promote = promote;
  }

  override checkpoint(roots: MaterializationWorkspaceRoots) {
    return this.#delegate.checkpoint(roots);
  }

  override stagePage(
    ...args: Parameters<MaterializationWorkspacePort['stagePage']>
  ): ReturnType<MaterializationWorkspacePort['stagePage']> {
    return this.#delegate.stagePage(...args);
  }

  override stagePages(
    sources: readonly Uint8Array[],
    options: StagePagesOptions,
  ): Promise<readonly string[]> {
    const stagePages = this.#delegate.stagePages;
    if (stagePages === undefined) {
      throw new Error('Performance runtime requires batched materialization page staging');
    }
    return stagePages.call(this.#delegate, sources, options);
  }

  override stageOrderedBundle(
    ...args: Parameters<MaterializationWorkspacePort['stageOrderedBundle']>
  ): ReturnType<MaterializationWorkspacePort['stageOrderedBundle']> {
    return this.#delegate.stageOrderedBundle(...args);
  }

  override promote(
    request: PromoteMaterializationRequest,
  ): Promise<MaterializationHandle> {
    return this.#promote(request);
  }

  override release(): Promise<void> {
    return this.#delegate.release();
  }
}
