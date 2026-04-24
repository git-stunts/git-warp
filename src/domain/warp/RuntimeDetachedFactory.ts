/**
 * RuntimeDetachedFactory — adapter wrapping WarpRuntime's graph cloning.
 *
 * Creates read-only detached graph instances for isolated materialization.
 */

import DetachedGraphFactory from '../capabilities/DetachedGraphFactory.ts';
import { openDetachedGraph } from '../services/controllers/detachedOpen.ts';
import type { DetachedGraphReadSurface } from '../capabilities/DetachedGraphFactory.ts';
import type { DetachedOpenHost } from '../services/controllers/detachedOpen.ts';

export default class RuntimeDetachedFactory extends DetachedGraphFactory {
  private readonly _runtime: DetachedOpenHost;

  constructor(runtime: DetachedOpenHost) {
    super();
    this._runtime = runtime;
  }

  async openReadOnly(): Promise<DetachedGraphReadSurface> {
    return await openDetachedGraph(this._runtime);
  }
}
