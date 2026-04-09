import Transform from '../../domain/stream/Transform.ts';
import WarpError from '../../domain/errors/WarpError.ts';

/**
 * Stream transform that writes the bytes component of [path, bytes] entries
 * as Git blobs and yields [path, oid].
 *
 * Input:  `[string, Uint8Array]` — path + blob content
 * Output: `[string, string]` — path + Git blob OID
 *
 * @extends {Transform<[string, Uint8Array], [string, string]>}
 */
export class GitBlobWriteTransform extends Transform {
  /**
   * Creates a GitBlobWriteTransform.
   *
   * @param {{ writeBlob(content: Uint8Array | string): Promise<string> }} blobPort
   */
  constructor(blobPort) {
    super();
    if (blobPort === null || blobPort === undefined) {
      throw new WarpError('GitBlobWriteTransform requires a blobPort', 'E_INVALID_DEPENDENCY');
    }
    /** @type {{ writeBlob(content: Uint8Array | string): Promise<string> }} */
    this._blobPort = blobPort;
  }

  /**
   * Writes each [path, bytes] entry as a blob, yielding [path, oid].
   *
   * @param {AsyncIterable<[string, Uint8Array]>} source
   * @returns {AsyncIterable<[string, string]>}
   */
  async *apply(source) {
    for await (const [path, bytes] of source) {
      const oid = await this._blobPort.writeBlob(bytes);
      yield [path, oid];
    }
  }
}
