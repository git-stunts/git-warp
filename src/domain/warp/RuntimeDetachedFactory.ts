/**
 * RuntimeDetachedFactory — adapter wrapping WarpRuntime's graph cloning.
 *
 * Creates read-only detached graph instances for isolated materialization.
 */

import DetachedGraphFactory from '../capabilities/DetachedGraphFactory.ts';
import { openDetachedGraph } from '../services/controllers/detachedOpen.ts';
import type WarpRuntime from '../WarpRuntime.js';

export default class RuntimeDetachedFactory extends DetachedGraphFactory {
  private readonly _runtime: WarpRuntime;

  constructor(runtime: WarpRuntime) {
    super();
    this._runtime = runtime;
  }

  async openReadOnly(): Promise<WarpRuntime> {
    return await openDetachedGraph(this._runtime);
  }
}
