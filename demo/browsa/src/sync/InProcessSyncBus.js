/**
 * InProcessSyncBus — orchestrates sync between in-memory WarpGraph instances.
 *
 * Since all instances share the same InMemoryGraphAdapter, "sync" means
 * ensuring each graph instance re-materializes to see all writers' patches.
 * For the FETCH/PULL/PUSH/HTTP SYNC simulation, we use the actual
 * SyncProtocol methods available on WarpGraph.
 */

/**
 * @typedef {{ id: string, graph: import('@git-stunts/git-warp/browser').WarpGraph }} Registration
 */

export default class InProcessSyncBus {
  constructor() {
    /** @type {Map<string, import('@git-stunts/git-warp/browser').WarpGraph>} */
    this._graphs = new Map();
  }

  /**
   * @param {string} id
   * @param {import('@git-stunts/git-warp/browser').WarpGraph} graph
   */
  register(id, graph) {
    this._graphs.set(id, graph);
  }

  /**
   * @param {string} id
   */
  unregister(id) {
    this._graphs.delete(id);
  }

  /**
   * Bilateral sync: both graphs re-materialize to see each other's patches.
   * Since they share a persistence layer, patches are already visible —
   * materialization is all that's needed.
   *
   * @param {string} a
   * @param {string} b
   * @returns {Promise<void>}
   */
  async sync(a, b) {
    const ga = this._graphs.get(a);
    const gb = this._graphs.get(b);
    if (!ga || !gb) {
      throw new Error(`Unknown viewport: ${!ga ? a : b}`);
    }
    await ga.materialize();
    await gb.materialize();
  }

  /**
   * Sync all registered graphs — each re-materializes.
   * @returns {Promise<void>}
   */
  async syncAll() {
    const graphs = [...this._graphs.values()];
    await Promise.all(graphs.map((g) => g.materialize()));
  }
}
