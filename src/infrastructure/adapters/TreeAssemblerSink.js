import Sink from '../../domain/stream/Sink.js';
import WarpError from '../../domain/errors/WarpError.ts';

/**
 * Stream sink that accumulates [path, oid] entries and assembles them
 * into a Git tree on finalization.
 *
 * Consumes: `[string, string]` — path + blob OID
 * Produces: `string` — the Git tree OID
 *
 * @extends {Sink<[string, string], string>}
 */
export class TreeAssemblerSink extends Sink {
  /**
   * Creates a TreeAssemblerSink.
   *
   * @param {{ writeTree(entries: string[]): Promise<string> }} treePort
   */
  constructor(treePort) {
    super();
    if (treePort === null || treePort === undefined) {
      throw new WarpError('TreeAssemblerSink requires a treePort', 'E_INVALID_DEPENDENCY');
    }
    /** @type {{ writeTree(entries: string[]): Promise<string> }} */
    this._treePort = treePort;
    /** @type {string[]} mktree-formatted entries */
    this._entries = [];
  }

  /**
   * Accepts a [path, oid] entry and formats it for mktree.
   *
   * @param {[string, string]} item
   */
  _accept(item) {
    const [path, oid] = item;
    this._entries.push(`100644 blob ${oid}\t${path}`);
  }

  /**
   * Builds the Git tree from accumulated entries.
   *
   * @returns {Promise<string>} The tree OID
   */
  async _finalize() {
    this._entries.sort();
    return await this._treePort.writeTree(this._entries);
  }
}
