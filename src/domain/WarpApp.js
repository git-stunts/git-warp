import WarpCore from './WarpCore.js';
import { callInternalRuntimeMethod } from './utils/callInternalRuntimeMethod.js';

/**
 * Curated product-facing WARP surface.
 *
 * `WarpApp` is the default entrypoint for application builders, agentic CLI
 * usage, and other flows that should prefer worldlines, lenses, observers,
 * strands, and explicit sync over whole-state replay mechanics.
 */
export default class WarpApp {
  /**
   * Wraps a WarpCore instance in the product-facing surface.
   * @param {WarpCore} core
   */
  constructor(core) {
    /** @private @type {unknown} */
    this._core = core;
  }

  /**
   * Opens or creates a multi-writer graph and returns the product-facing app surface.
   *
   * @param {Parameters<typeof WarpCore.open>[0]} options
   * @returns {Promise<WarpApp>}
   */
  static async open(options) {
    return new WarpApp(await WarpCore.open(options));
  }

  /**
   * The graph namespace.
   * @returns {string}
   */
  get graphName() {
    return this._runtime().graphName;
  }

  /**
   * This writer's ID.
   * @returns {string}
   */
  get writerId() {
    return this._runtime().writerId;
  }

  /**
   * Explicit escape hatch to the full substrate/tooling surface.
   *
   * @returns {WarpCore}
   */
  core() {
    return /** @type {WarpCore} */ (this._core);
  }

  /**
   * Returns the underlying WarpRuntime for internal delegation.
   * @returns {import('./WarpRuntime.js').default}
   * @private
   */
  _runtime() {
    return /** @type {import('./WarpRuntime.js').default} */ (this._core);
  }

  /**
   * Obtains a Writer handle for appending patches to this graph.
   * @returns {Promise<import('./warp/Writer.js').Writer>}
   * @param {string} [writerId]
   */
  async writer(writerId) {
    return await this._runtime().writer(writerId);
  }

  /**
   * Creates a new uncommitted patch builder for this writer.
   * @returns {Promise<import('./services/PatchBuilderV2.js').PatchBuilderV2>}
   */
  async createPatch() {
    return await this._runtime().createPatch();
  }

  /**
   * Builds and commits a single patch in one call.
   * @param {(patch: import('./services/PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<string>}
   */
  async patch(build) {
    return await this._runtime().patch(build);
  }

  /**
   * Builds and commits multiple patches sequentially, returning their SHAs.
   * @param {...((patch: import('./services/PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>)} builds
   * @returns {Promise<string[]>}
   */
  async patchMany(...builds) {
    return await this._runtime().patchMany(...builds);
  }

  /**
   * Synchronises this graph with a remote graph or endpoint.
   * @param {string | WarpApp | WarpCore} remote
   * @param {Parameters<import('./WarpRuntime.js').default['syncWith']>[1]} [options]
   * @returns {ReturnType<import('./WarpRuntime.js').default['syncWith']>}
   */
  async syncWith(remote, options) {
    const unwrappedRemote =
      typeof remote === 'string'
        ? remote
        : remote instanceof WarpApp
          ? /** @type {import('./WarpRuntime.js').default} */ (/** @type {unknown} */ (remote.core()))
          : /** @type {import('./WarpRuntime.js').default} */ (/** @type {unknown} */ (remote));
    return await this._runtime().syncWith(unwrappedRemote, options);
  }

  /**
   * Returns the current worldline snapshot of this graph.
   * @param {Parameters<import('./WarpRuntime.js').default['worldline']>[0]} [options]
   * @returns {ReturnType<import('./WarpRuntime.js').default['worldline']>}
   */
  worldline(options) {
    return this._runtime().worldline(options);
  }

  /**
   * Creates an observer that projects the graph through an aperture.
   * @param {string | import('../../index.js').Aperture} nameOrConfig
   * @param {import('../../index.js').Aperture | import('../../index.js').ObserverOptions} [configOrOptions]
   * @param {import('../../index.js').ObserverOptions} [maybeOptions]
   * @returns {Promise<import('../../index.js').Observer>}
   */
  async observer(nameOrConfig, configOrOptions, maybeOptions) {
    if (typeof nameOrConfig === 'string') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- return through defineProperty delegation; type is declared in @returns
      return await this._runtime().observer(
        nameOrConfig,
        /** @type {import('../../index.js').Aperture} */ (configOrOptions),
        maybeOptions,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- return through defineProperty delegation; type is declared in @returns
    return await this._runtime().observer(
      nameOrConfig,
      /** @type {import('../../index.js').ObserverOptions | undefined} */ (configOrOptions),
    );
  }

  /**
   * Computes the directed translation cost between two observer configurations.
   * @param {Parameters<import('./WarpRuntime.js').default['translationCost']>[0]} configA
   * @param {Parameters<import('./WarpRuntime.js').default['translationCost']>[1]} configB
   * @returns {ReturnType<import('./WarpRuntime.js').default['translationCost']>}
   */
  async translationCost(configA, configB) {
    return await this._runtime().translationCost(configA, configB);
  }

  /**
   * Subscribes to graph state-change notifications.
   * @param {Parameters<import('./WarpRuntime.js').default['subscribe']>[0]} options
   * @returns {ReturnType<import('./WarpRuntime.js').default['subscribe']>}
   */
  subscribe(options) {
    return this._runtime().subscribe(options);
  }

  /**
   * Watches for changes matching the given node-ID pattern(s).
   * @param {string | string[]} pattern
   * @param {Parameters<import('./WarpRuntime.js').default['watch']>[1]} options
   * @returns {ReturnType<import('./WarpRuntime.js').default['watch']>}
   */
  watch(pattern, options) {
    return this._runtime().watch(pattern, options);
  }

  // ── Content attachment reads ──────────────────────────────────────────
  /** Reads the full content blob attached to a node.
   * @param {string} nodeId @returns {Promise<Uint8Array|null>} */
  async getContent(nodeId) {
    return /** @type {Uint8Array|null} */ (await callInternalRuntimeMethod(this._runtime(), 'getContent', nodeId));
  }

  /** Returns a streaming reader for the content blob attached to a node.
   * @param {string} nodeId @returns {Promise<AsyncIterable<Uint8Array>|null>} */
  async getContentStream(nodeId) {
    return /** @type {AsyncIterable<Uint8Array>|null} */ (await callInternalRuntimeMethod(this._runtime(), 'getContentStream', nodeId));
  }

  /** Returns the Git object ID of the content blob attached to a node.
   * @param {string} nodeId @returns {Promise<string|null>} */
  async getContentOid(nodeId) {
    return /** @type {string|null} */ (await callInternalRuntimeMethod(this._runtime(), 'getContentOid', nodeId));
  }

  /** Returns structured content metadata (oid, mime, size) for a node.
   * @param {string} nodeId @returns {Promise<{ oid: string, mime: string|null, size: number|null }|null>} */
  async getContentMeta(nodeId) {
    return /** @type {{ oid: string, mime: string|null, size: number|null }|null} */ (await callInternalRuntimeMethod(this._runtime(), 'getContentMeta', nodeId));
  }

  /** Reads the full content blob attached to an edge.
   * @param {string} from @param {string} to @param {string} label @returns {Promise<Uint8Array|null>} */
  async getEdgeContent(from, to, label) {
    return /** @type {Uint8Array|null} */ (await callInternalRuntimeMethod(this._runtime(), 'getEdgeContent', from, to, label));
  }

  /** Returns a streaming reader for the content blob attached to an edge.
   * @param {string} from @param {string} to @param {string} label @returns {Promise<AsyncIterable<Uint8Array>|null>} */
  async getEdgeContentStream(from, to, label) {
    return /** @type {AsyncIterable<Uint8Array>|null} */ (await callInternalRuntimeMethod(this._runtime(), 'getEdgeContentStream', from, to, label));
  }

  /** Returns the Git object ID of the content blob attached to an edge.
   * @param {string} from @param {string} to @param {string} label @returns {Promise<string|null>} */
  async getEdgeContentOid(from, to, label) {
    return /** @type {string|null} */ (await callInternalRuntimeMethod(this._runtime(), 'getEdgeContentOid', from, to, label));
  }

  /** Returns structured content metadata (oid, mime, size) for an edge.
   * @param {string} from @param {string} to @param {string} label @returns {Promise<{ oid: string, mime: string|null, size: number|null }|null>} */
  async getEdgeContentMeta(from, to, label) {
    return /** @type {{ oid: string, mime: string|null, size: number|null }|null} */ (await callInternalRuntimeMethod(this._runtime(), 'getEdgeContentMeta', from, to, label));
  }

  // ── Strands ─────────────────────────────────────────────────────────

  /**
   * Creates a new strand (isolated sub-graph workspace).
   * @param {Parameters<WarpCore['createStrand']>[0]} [options]
   * @returns {ReturnType<WarpCore['createStrand']>}
   */
  async createStrand(options) {
    return await this.core().createStrand(options);
  }

  /**
   * Retrieves a strand by its identifier.
   * @param {string} strandId
   * @returns {ReturnType<WarpCore['getStrand']>}
   */
  async getStrand(strandId) {
    return await this.core().getStrand(strandId);
  }

  /**
   * Lists all strands in this graph.
   * @returns {ReturnType<WarpCore['listStrands']>}
   */
  async listStrands() {
    return await this.core().listStrands();
  }

  /**
   * Merges a strand back into the main graph.
   * @param {string} strandId
   * @param {Parameters<WarpCore['braidStrand']>[1]} [options]
   * @returns {ReturnType<WarpCore['braidStrand']>}
   */
  async braidStrand(strandId, options) {
    return await this.core().braidStrand(strandId, options);
  }

  /**
   * Drops (deletes) a strand and its associated refs.
   * @param {string} strandId
   * @returns {ReturnType<WarpCore['dropStrand']>}
   */
  async dropStrand(strandId) {
    return await this.core().dropStrand(strandId);
  }

  /**
   * Creates an uncommitted patch builder scoped to a strand.
   * @param {string} strandId
   * @returns {ReturnType<WarpCore['createStrandPatch']>}
   */
  async createStrandPatch(strandId) {
    return await this.core().createStrandPatch(strandId);
  }

  /**
   * Builds and commits a single patch to a strand.
   * @param {string} strandId
   * @param {(patch: import('./services/PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<string>}
   */
  async patchStrand(strandId, build) {
    return await this.core().patchStrand(strandId, build);
  }

  /**
   * Queues a deferred intent on a strand for later application.
   * @param {string} strandId
   * @param {(patch: import('./services/PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>} build
   * @returns {ReturnType<WarpCore['queueStrandIntent']>}
   */
  async queueStrandIntent(strandId, build) {
    return await this.core().queueStrandIntent(strandId, build);
  }

  /**
   * Lists pending intents queued on a strand.
   * @param {string} strandId
   * @returns {ReturnType<WarpCore['listStrandIntents']>}
   */
  async listStrandIntents(strandId) {
    return await this.core().listStrandIntents(strandId);
  }

  /**
   * Advances the strand by one tick, applying pending intents.
   * @param {string} strandId
   * @returns {ReturnType<WarpCore['tickStrand']>}
   */
  async tickStrand(strandId) {
    return await this.core().tickStrand(strandId);
  }
}
