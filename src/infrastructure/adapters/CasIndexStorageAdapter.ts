import type BlobPort from '../../ports/BlobPort.ts';
import type TreePort from '../../ports/TreePort.ts';
import type RefPort from '../../ports/RefPort.ts';
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';
import type { BlobStorageOptions } from '../../ports/BlobStoragePort.ts';
import StreamingIndexStoragePort from '../../ports/StreamingIndexStoragePort.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import {
  decodeCasPayloadPointer,
  encodeCasPayloadPointer,
  readPayloadBlob,
  writePayloadBlob,
} from './CasPayloadPointer.ts';

type CasIndexStorageAdapterOptions = {
  blobPort: BlobPort;
  treePort: TreePort;
  refPort: RefPort;
  blobStorage: BlobStoragePort;
};

export class CasIndexStorageAdapter extends StreamingIndexStoragePort {
  private readonly _blobPort: BlobPort;
  private readonly _treePort: TreePort;
  private readonly _refPort: RefPort;
  private readonly _blobStorage: BlobStoragePort;

  constructor(options: CasIndexStorageAdapterOptions) {
    super();
    this._blobPort = options.blobPort;
    this._treePort = options.treePort;
    this._refPort = options.refPort;
    this._blobStorage = options.blobStorage;
  }

  override async writeBlob(content: Uint8Array | string): Promise<string> {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    return await writePayloadBlob({
      blobPort: this._blobPort,
      blobStorage: this._blobStorage,
      bytes,
    });
  }

  override async readBlob(oid: string): Promise<Uint8Array> {
    return await readPayloadBlob({
      blobPort: this._blobPort,
      blobStorage: this._blobStorage,
      oid,
    });
  }

  override async writeBlobStream(
    source: AsyncIterable<Uint8Array>,
    options?: BlobStorageOptions,
  ): Promise<string> {
    const storageOid = await this._blobStorage.storeStream(source, options);
    return await this._blobPort.writeBlob(encodeCasPayloadPointer(storageOid));
  }

  override readBlobStream(oid: string): AsyncIterable<Uint8Array> {
    const adapter = this;
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        const pointerBytes = await adapter._blobPort.readBlob(oid);
        const storageOid = decodeCasPayloadPointer(pointerBytes);
        if (storageOid === null) {
          throw new WarpError(
            `Inline index payload blob ${oid} requires the substrate migration compatibility policy`,
            'E_LEGACY_SUBSTRATE_DISABLED',
          );
        }
        for await (const chunk of adapter._blobStorage.retrieveStream(storageOid)) {
          yield chunk;
        }
      },
    };
  }

  override async writeTree(entries: string[]): Promise<string> {
    return await this._treePort.writeTree(entries);
  }

  override async readTreeOids(treeOid: string): Promise<Record<string, string>> {
    return await this._treePort.readTreeOids(treeOid);
  }

  override async updateRef(ref: string, oid: string): Promise<void> {
    await this._refPort.updateRef(ref, oid);
  }

  override async readRef(ref: string): Promise<string | null> {
    return await this._refPort.readRef(ref);
  }
}
