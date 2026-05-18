import type { GitPersistenceAdapter } from '@git-stunts/git-cas';

interface GitCasGraphReaderAdapterOptions {
  readonly persistence: GitPersistenceAdapter;
  readonly assertEmptyBlobExists: (oid: string) => Promise<void>;
}

export default class GitCasGraphReaderAdapter {
  private readonly _persistence: GitPersistenceAdapter;
  private readonly _assertEmptyBlobExists: (oid: string) => Promise<void>;

  constructor(options: GitCasGraphReaderAdapterOptions) {
    this._persistence = options.persistence;
    this._assertEmptyBlobExists = options.assertEmptyBlobExists;
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
    const oids: Record<string, string> = {};
    await this._collectTreeOids(treeOid, '', oids);
    return oids;
  }

  private async _collectTreeOids(
    treeOid: string,
    pathPrefix: string,
    oids: Record<string, string>,
  ): Promise<void> {
    for await (const entry of this._persistence.iterateTree(treeOid)) {
      const path = `${pathPrefix}${entry.name}`;
      if (entry.type === 'tree') {
        await this._collectTreeOids(entry.oid, `${path}/`, oids);
        continue;
      }
      oids[path] = entry.oid;
    }
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
