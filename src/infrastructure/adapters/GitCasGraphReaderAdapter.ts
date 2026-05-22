import type { GitPersistenceAdapter } from '@git-stunts/git-cas';

type TreeOidReader = {
  readTreeOids(treeOid: string): Promise<Record<string, string>>;
};

interface GitCasGraphReaderAdapterOptions {
  readonly persistence: GitPersistenceAdapter;
  readonly assertEmptyBlobExists: (oid: string) => Promise<void>;
  readonly treeOidReader: TreeOidReader;
}

export default class GitCasGraphReaderAdapter {
  private readonly _persistence: GitPersistenceAdapter;
  private readonly _assertEmptyBlobExists: (oid: string) => Promise<void>;
  private readonly _treeOidReader: TreeOidReader;

  constructor(options: GitCasGraphReaderAdapterOptions) {
    this._persistence = options.persistence;
    this._assertEmptyBlobExists = options.assertEmptyBlobExists;
    this._treeOidReader = options.treeOidReader;
  }

  async readBlob(oid: string): Promise<Uint8Array> {
    const stream = await this._persistence.readBlobStream(oid);
    const bytes = await collectUnboundedGraphBlobStream(stream);
    if (bytes.byteLength === 0) {
      await this._assertEmptyBlobExists(oid);
    }
    return bytes;
  }

  async readTreeOids(treeOid: string): Promise<Record<string, string>> {
    return await this._treeOidReader.readTreeOids(treeOid);
  }
}

async function collectUnboundedGraphBlobStream(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  for await (const chunk of source) {
    const bytes = normalizeBytes(chunk);
    chunks.push(bytes);
    byteLength += bytes.byteLength;
  }

  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function normalizeBytes(chunk: Uint8Array): Uint8Array {
  if (chunk.constructor === Uint8Array) {
    return chunk;
  }
  return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
}
