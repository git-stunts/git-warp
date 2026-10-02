import { collectAsyncIterable } from '../../domain/utils/streamUtils.ts';
import { MAX_BUFFERED_ARTIFACT_BYTES } from '../../domain/storage/BufferedArtifactLimit.ts';
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
    const bytes = await collectAsyncIterable(stream, MAX_BUFFERED_ARTIFACT_BYTES);
    if (bytes.byteLength === 0) {
      await this._assertEmptyBlobExists(oid);
    }
    return bytes;
  }

  async readTreeOids(treeOid: string): Promise<Record<string, string>> {
    return await this._treeOidReader.readTreeOids(treeOid);
  }
}

