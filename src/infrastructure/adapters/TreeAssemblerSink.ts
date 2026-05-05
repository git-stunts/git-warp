import Sink from '../../domain/stream/Sink.ts';
import WarpError from '../../domain/errors/WarpError.ts';

interface TreePort {
  writeTree(entries: string[]): Promise<string>;
}

/**
 * Stream sink that accumulates [path, oid] entries and assembles them
 * into a Git tree on finalization.
 *
 * Consumes: `[string, string]` — path + blob OID
 * Produces: `string` — the Git tree OID
 */
export class TreeAssemblerSink extends Sink<[string, string], string> {
  private readonly _treePort: TreePort;
  private readonly _entries: string[];

  constructor(treePort: TreePort) {
    super();
    if (treePort === null || treePort === undefined) {
      throw new WarpError('TreeAssemblerSink requires a treePort', 'E_INVALID_DEPENDENCY');
    }
    this._treePort = treePort;
    this._entries = [];
  }

  /**
   * Accepts a [path, oid] entry and formats it for mktree.
   */
  protected override _accept(item: [string, string]): void {
    const [path, oid] = item;
    this._entries.push(`100644 blob ${oid}\t${path}`);
  }

  /**
   * Builds the Git tree from accumulated entries.
   */
  protected override async _finalize(): Promise<string> {
    this._entries.sort();
    return await this._treePort.writeTree(this._entries);
  }
}
