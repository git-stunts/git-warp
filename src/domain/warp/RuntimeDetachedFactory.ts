/**
 * RuntimeDetachedFactory — adapter wrapping WarpRuntime's graph cloning.
 *
 * Creates read-only detached graph instances for isolated materialization.
 */

import DetachedGraphFactory, { type DetachedGraphInternalReadSurface } from '../capabilities/DetachedGraphFactory.ts';
import {
  openDetachedGraph,
  type DetachedGraphOpen,
  type DetachedOpenHost,
} from '../services/controllers/detachedOpen.ts';

export default class RuntimeDetachedFactory extends DetachedGraphFactory {
  private readonly _runtime: DetachedOpenHost;

  private readonly _open: DetachedGraphOpen;

  constructor(runtime: DetachedOpenHost, open: DetachedGraphOpen) {
    super();
    this._runtime = runtime;
    this._open = open;
  }

  async openReadOnly(): Promise<DetachedGraphInternalReadSurface> {
    return await openDetachedGraph(this._runtime, this._open);
  }
}
