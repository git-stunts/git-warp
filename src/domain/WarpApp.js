import WarpCore from './WarpCore.js';
import {
  getContent as _getContent,
  getContentStream as _getContentStream,
  getContentOid as _getContentOid,
  getContentMeta as _getContentMeta,
  getEdgeContent as _getEdgeContent,
  getEdgeContentStream as _getEdgeContentStream,
  getEdgeContentOid as _getEdgeContentOid,
  getEdgeContentMeta as _getEdgeContentMeta,
} from './warp/query.methods.js';

/**
 * Curated product-facing WARP surface.
 *
 * `WarpApp` is the default entrypoint for application builders, agentic CLI
 * usage, and other flows that should prefer worldlines, lenses, observers,
 * strands, and explicit sync over whole-state replay mechanics.
 */
export default class WarpApp {
  /**
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
   * @returns {import('./WarpRuntime.js').default}
   * @private
   */
  _runtime() {
    return /** @type {import('./WarpRuntime.js').default} */ (this._core);
  }

  /**
   * @returns {Promise<import('./warp/Writer.js').Writer>}
   * @param {string} [writerId]
   */
  async writer(writerId) {
    return await this._runtime().writer(writerId);
  }

  /**
   * @returns {Promise<import('./services/PatchBuilderV2.js').PatchBuilderV2>}
   */
  async createPatch() {
    return await this._runtime().createPatch();
  }

  /**
   * @param {(patch: import('./services/PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<string>}
   */
  async patch(build) {
    return await this._runtime().patch(build);
  }

  /**
   * @param {...((patch: import('./services/PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>)} builds
   * @returns {Promise<string[]>}
   */
  async patchMany(...builds) {
    return await this._runtime().patchMany(...builds);
  }

  /**
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
   * @param {Parameters<import('./WarpRuntime.js').default['worldline']>[0]} [options]
   * @returns {ReturnType<import('./WarpRuntime.js').default['worldline']>}
   */
  worldline(options) {
    return this._runtime().worldline(options);
  }

  /**
   * @param {string | import('../../index.js').Aperture} nameOrConfig
   * @param {import('../../index.js').Aperture | import('../../index.js').ObserverOptions} [configOrOptions]
   * @param {import('../../index.js').ObserverOptions} [maybeOptions]
   * @returns {Promise<import('../../index.js').Observer>}
   */
  async observer(nameOrConfig, configOrOptions, maybeOptions) {
    if (typeof nameOrConfig === 'string') {
      return await this._runtime().observer(
        nameOrConfig,
        /** @type {import('../../index.js').Aperture} */ (configOrOptions),
        maybeOptions,
      );
    }
    return await this._runtime().observer(
      nameOrConfig,
      /** @type {import('../../index.js').ObserverOptions | undefined} */ (configOrOptions),
    );
  }

  /**
   * @param {Parameters<import('./WarpRuntime.js').default['translationCost']>[0]} configA
   * @param {Parameters<import('./WarpRuntime.js').default['translationCost']>[1]} configB
   * @returns {ReturnType<import('./WarpRuntime.js').default['translationCost']>}
   */
  async translationCost(configA, configB) {
    return await this._runtime().translationCost(configA, configB);
  }

  /**
   * @param {Parameters<import('./WarpRuntime.js').default['subscribe']>[0]} options
   * @returns {ReturnType<import('./WarpRuntime.js').default['subscribe']>}
   */
  subscribe(options) {
    return this._runtime().subscribe(options);
  }

  /**
   * @param {string | string[]} pattern
   * @param {Parameters<import('./WarpRuntime.js').default['watch']>[1]} options
   * @returns {ReturnType<import('./WarpRuntime.js').default['watch']>}
   */
  watch(pattern, options) {
    return this._runtime().watch(pattern, options);
  }

  // ── Content attachment reads ──────────────────────────────────────────
  // Imported from query.methods.js and called with the runtime as this binding.

  /** @param {string} nodeId @returns {Promise<Uint8Array|null>} */
  async getContent(nodeId) {
    return await _getContent.call(this._runtime(), nodeId);
  }

  /** @param {string} nodeId @returns {Promise<AsyncIterable<Uint8Array>|null>} */
  async getContentStream(nodeId) {
    return await _getContentStream.call(this._runtime(), nodeId);
  }

  /** @param {string} nodeId @returns {Promise<string|null>} */
  async getContentOid(nodeId) {
    return await _getContentOid.call(this._runtime(), nodeId);
  }

  /** @param {string} nodeId @returns {Promise<{ oid: string, mime: string|null, size: number|null }|null>} */
  async getContentMeta(nodeId) {
    return await _getContentMeta.call(this._runtime(), nodeId);
  }

  /** @param {string} from @param {string} to @param {string} label @returns {Promise<Uint8Array|null>} */
  async getEdgeContent(from, to, label) {
    return await _getEdgeContent.call(this._runtime(), from, to, label);
  }

  /** @param {string} from @param {string} to @param {string} label @returns {Promise<AsyncIterable<Uint8Array>|null>} */
  async getEdgeContentStream(from, to, label) {
    return await _getEdgeContentStream.call(this._runtime(), from, to, label);
  }

  /** @param {string} from @param {string} to @param {string} label @returns {Promise<string|null>} */
  async getEdgeContentOid(from, to, label) {
    return await _getEdgeContentOid.call(this._runtime(), from, to, label);
  }

  /** @param {string} from @param {string} to @param {string} label @returns {Promise<{ oid: string, mime: string|null, size: number|null }|null>} */
  async getEdgeContentMeta(from, to, label) {
    return await _getEdgeContentMeta.call(this._runtime(), from, to, label);
  }

  // ── Strands ─────────────────────────────────────────────────────────

  /**
   * @param {Parameters<WarpCore['createStrand']>[0]} [options]
   * @returns {ReturnType<WarpCore['createStrand']>}
   */
  async createStrand(options) {
    return await this.core().createStrand(options);
  }

  /**
   * @param {string} strandId
   * @returns {ReturnType<WarpCore['getStrand']>}
   */
  async getStrand(strandId) {
    return await this.core().getStrand(strandId);
  }

  /**
   * @returns {ReturnType<WarpCore['listStrands']>}
   */
  async listStrands() {
    return await this.core().listStrands();
  }

  /**
   * @param {string} strandId
   * @param {Parameters<WarpCore['braidStrand']>[1]} [options]
   * @returns {ReturnType<WarpCore['braidStrand']>}
   */
  async braidStrand(strandId, options) {
    return await this.core().braidStrand(strandId, options);
  }

  /**
   * @param {string} strandId
   * @returns {ReturnType<WarpCore['dropStrand']>}
   */
  async dropStrand(strandId) {
    return await this.core().dropStrand(strandId);
  }

  /**
   * @param {string} strandId
   * @returns {ReturnType<WarpCore['createStrandPatch']>}
   */
  async createStrandPatch(strandId) {
    return await this.core().createStrandPatch(strandId);
  }

  /**
   * @param {string} strandId
   * @param {(patch: import('./services/PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<string>}
   */
  async patchStrand(strandId, build) {
    return await this.core().patchStrand(strandId, build);
  }

  /**
   * @param {string} strandId
   * @param {(patch: import('./services/PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>} build
   * @returns {ReturnType<WarpCore['queueStrandIntent']>}
   */
  async queueStrandIntent(strandId, build) {
    return await this.core().queueStrandIntent(strandId, build);
  }

  /**
   * @param {string} strandId
   * @returns {ReturnType<WarpCore['listStrandIntents']>}
   */
  async listStrandIntents(strandId) {
    return await this.core().listStrandIntents(strandId);
  }

  /**
   * @param {string} strandId
   * @returns {ReturnType<WarpCore['tickStrand']>}
   */
  async tickStrand(strandId) {
    return await this.core().tickStrand(strandId);
  }
}
