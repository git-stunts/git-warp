import Transform from '../../domain/stream/Transform.ts';
import WarpError from '../../domain/errors/WarpError.ts';

interface BlobPort {
  writeBlob(content: Uint8Array | string): Promise<string>;
}

/**
 * Stream transform that writes the bytes component of [path, bytes] entries
 * as Git blobs and yields [path, oid].
 *
 * Input:  `[string, Uint8Array]` — path + blob content
 * Output: `[string, string]` — path + Git blob OID
 */
export class GitBlobWriteTransform extends Transform<[string, Uint8Array], [string, string]> {
  private readonly _blobPort: BlobPort;

  constructor(blobPort: BlobPort) {
    super();
    if (blobPort === null || blobPort === undefined) {
      throw new WarpError('GitBlobWriteTransform requires a blobPort', 'E_INVALID_DEPENDENCY');
    }
    this._blobPort = blobPort;
  }

  override async *apply(source: AsyncIterable<[string, Uint8Array]>): AsyncIterable<[string, string]> {
    for await (const [path, bytes] of source) {
      const oid = await this._blobPort.writeBlob(bytes);
      yield [path, oid];
    }
  }
}
