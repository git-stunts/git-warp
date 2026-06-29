import type BlobStoragePort from '../../../ports/BlobStoragePort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import WarpError from '../../errors/WarpError.ts';

export interface CasFirstMemoizationDeps {
  blobStorage: BlobStoragePort;
  crypto: CryptoPort;
  codec: CodecPort;
}

export interface MaterializationRequest<T> {
  /** Deterministic coordinate/seed parameters defining the materialization */
  coordinateKeyParams: string;
  /** Lazy materialization streaming callback if not found in git-cas */
  materializeStream: () => AsyncIterable<Uint8Array>;
  /** Decode the retrieved/streamed buffer into the final domain object */
  decodeObject: (_buffer: Uint8Array) => Promise<T> | T;
}

export interface CasMaterializationResult<T> {
  object: T;
  casTreeOid: string;
  hit: boolean;
}

export default class CasFirstMemoizationEngine {
  private readonly _blobStorage: BlobStoragePort;
  private readonly _crypto: CryptoPort;
  private readonly _codec: CodecPort;

  constructor(deps: CasFirstMemoizationDeps) {
    if (deps.blobStorage === null || deps.blobStorage === undefined) {
      throw new WarpError('blobStorage is required for CAS-first memoization', 'E_INVALID_ARG');
    }
    this._blobStorage = deps.blobStorage;
    this._crypto = deps.crypto;
    this._codec = deps.codec;
  }

  /**
   * Executes the CAS-First Memoization lifecycle:
   * 2.1. Is object already in git-cas?
   * 2.2. No? Materialize via streaming
   * 2.3. Write materialized git-object to git-cas always
   */
  async materialize<T>(request: MaterializationRequest<T>): Promise<CasMaterializationResult<T>> {
    void this._codec;
    const key = await this._crypto.hash('sha256', request.coordinateKeyParams);

    const hitResult = await this._tryCasHit(key, request);
    if (hitResult !== null) {
      return hitResult;
    }

    return await this._materializeAndStore(key, request);
  }

  private async _tryCasHit<T>(
    key: string,
    request: MaterializationRequest<T>,
  ): Promise<CasMaterializationResult<T> | null> {
    if (typeof this._blobStorage.has === 'function') {
      const exists = await this._blobStorage.has(key);
      if (exists) {
        const buffer = await this._blobStorage.retrieve(key);
        const object = await request.decodeObject(buffer);
        return { object, casTreeOid: key, hit: true };
      }
      return null;
    }
    try {
      const buffer = await this._blobStorage.retrieve(key);
      const object = await request.decodeObject(buffer);
      return { object, casTreeOid: key, hit: true };
    } catch {
      return null;
    }
  }

  private async _materializeAndStore<T>(
    key: string,
    request: MaterializationRequest<T>,
  ): Promise<CasMaterializationResult<T>> {
    const rawStream = request.materializeStream();
    const chunks: Uint8Array[] = [];

    const teeStream = (async function* () {
      for await (const chunk of rawStream) {
        chunks.push(chunk);
        yield chunk;
      }
    })();

    const casTreeOid = await this._blobStorage.storeStream(teeStream, { slug: key });

    const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
    const fullBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      fullBuffer.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const object = await request.decodeObject(fullBuffer);
    return { object, casTreeOid, hit: false };
  }
}
