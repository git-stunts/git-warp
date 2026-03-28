import WarpCore from './WarpCore.js';

/**
 * Curated product-facing WARP surface.
 *
 * `WarpApp` is the default entrypoint for application builders, agentic CLI
 * usage, and other flows that should prefer worldlines, lenses, observers,
 * speculative lanes, and explicit sync over whole-state replay mechanics.
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
   * @param {{ persist?: 'config' | 'none', alias?: string }} [opts]
   * @returns {Promise<import('./warp/Writer.js').Writer>}
   */
  async createWriter(opts) {
    return await this._runtime().createWriter(opts);
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
   * @param {import('./WarpRuntime.js').default['syncWith'] extends (remote: infer R, options?: infer O) => infer P ? string | WarpApp | WarpCore : never} remote
   * @param {Parameters<import('./WarpRuntime.js').default['syncWith']>[1]} [options]
   * @returns {ReturnType<import('./WarpRuntime.js').default['syncWith']>}
   */
  async syncWith(remote, options) {
    const unwrappedRemote =
      typeof remote === 'string'
        ? remote
        : remote instanceof WarpApp
          ? /** @type {import('./WarpRuntime.js').default} */ (remote.core())
          : /** @type {import('./WarpRuntime.js').default} */ (remote);
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
   * @param {string | import('../../index.js').Lens} nameOrConfig
   * @param {import('../../index.js').Lens | import('../../index.js').ObserverOptions} [configOrOptions]
   * @param {import('../../index.js').ObserverOptions} [maybeOptions]
   * @returns {Promise<import('../../index.js').Observer>}
   */
  async observer(nameOrConfig, configOrOptions, maybeOptions) {
    if (typeof nameOrConfig === 'string') {
      return await this._runtime().observer(
        nameOrConfig,
        /** @type {import('../../index.js').Lens} */ (configOrOptions),
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

  /**
   * @param {Parameters<import('./WarpRuntime.js').default['createWorkingSet']>[0]} [options]
   * @returns {ReturnType<import('./WarpRuntime.js').default['createWorkingSet']>}
   */
  async createWorkingSet(options) {
    return await this._runtime().createWorkingSet(options);
  }

  /**
   * @param {string} workingSetId
   * @returns {ReturnType<import('./WarpRuntime.js').default['getWorkingSet']>}
   */
  async getWorkingSet(workingSetId) {
    return await this._runtime().getWorkingSet(workingSetId);
  }

  /**
   * @returns {ReturnType<import('./WarpRuntime.js').default['listWorkingSets']>}
   */
  async listWorkingSets() {
    return await this._runtime().listWorkingSets();
  }

  /**
   * @param {string} workingSetId
   * @param {Parameters<import('./WarpRuntime.js').default['braidWorkingSet']>[1]} [options]
   * @returns {ReturnType<import('./WarpRuntime.js').default['braidWorkingSet']>}
   */
  async braidWorkingSet(workingSetId, options) {
    return await this._runtime().braidWorkingSet(workingSetId, options);
  }

  /**
   * @param {string} workingSetId
   * @returns {ReturnType<import('./WarpRuntime.js').default['dropWorkingSet']>}
   */
  async dropWorkingSet(workingSetId) {
    return await this._runtime().dropWorkingSet(workingSetId);
  }

  /**
   * @param {string} workingSetId
   * @returns {ReturnType<import('./WarpRuntime.js').default['createWorkingSetPatch']>}
   */
  async createWorkingSetPatch(workingSetId) {
    return await this._runtime().createWorkingSetPatch(workingSetId);
  }

  /**
   * @param {string} workingSetId
   * @param {(patch: import('./services/PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<string>}
   */
  async patchWorkingSet(workingSetId, build) {
    return await this._runtime().patchWorkingSet(workingSetId, build);
  }

  /**
   * @param {string} workingSetId
   * @param {(patch: import('./services/PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>} build
   * @returns {ReturnType<import('./WarpRuntime.js').default['queueWorkingSetIntent']>}
   */
  async queueWorkingSetIntent(workingSetId, build) {
    return await this._runtime().queueWorkingSetIntent(workingSetId, build);
  }

  /**
   * @param {string} workingSetId
   * @returns {ReturnType<import('./WarpRuntime.js').default['listWorkingSetIntents']>}
   */
  async listWorkingSetIntents(workingSetId) {
    return await this._runtime().listWorkingSetIntents(workingSetId);
  }

  /**
   * @param {string} workingSetId
   * @returns {ReturnType<import('./WarpRuntime.js').default['tickWorkingSet']>}
   */
  async tickWorkingSet(workingSetId) {
    return await this._runtime().tickWorkingSet(workingSetId);
  }
}
