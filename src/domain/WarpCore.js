import WarpRuntime from './WarpRuntime.js';

/**
 * Full plumbing-facing WARP surface.
 *
 * `WarpCore` is the honest substrate/tooling entrypoint for replay,
 * materialization, provenance, comparison, and other low-level mechanics.
 * It adopts the existing runtime implementation rather than forking it.
 */
export default class WarpCore {
  /**
   * Opens or creates a multi-writer graph and returns the full core surface.
   *
   * @param {Parameters<typeof WarpRuntime.open>[0]} options
   * @returns {Promise<WarpCore>}
   */
  static async open(options) {
    const runtime = await WarpRuntime.open(options);
    return WarpCore._adopt(runtime);
  }

  /**
   * @param {WarpRuntime | WarpCore} runtime
   * @returns {WarpCore}
   * @internal
   */
  static _adopt(runtime) {
    if (runtime instanceof WarpCore) {
      return runtime;
    }
    Object.setPrototypeOf(runtime, WarpCore.prototype);
    return /** @type {WarpCore} */ (runtime);
  }
}

Object.setPrototypeOf(WarpCore.prototype, WarpRuntime.prototype);
