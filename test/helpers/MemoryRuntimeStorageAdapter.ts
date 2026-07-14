import type { CorePersistence } from '../../src/domain/types/WarpPersistence.ts';
import type BlobStoragePort from '../../src/ports/BlobStoragePort.ts';
import {
  LEGACY_EXTERNAL_PATCH_STORAGE,
  LEGACY_GIT_BLOB_PATCH_STORAGE,
} from '../../src/ports/CommitMessageCodecPort.ts';
import type RuntimeStorageProviderPort from '../../src/ports/RuntimeStorageProviderPort.ts';
import type {
  RuntimeStorageRequest,
  RuntimeStorageServices,
} from '../../src/ports/RuntimeStorageProviderPort.ts';
import { CborCheckpointStoreAdapter } from '../../src/infrastructure/adapters/CborCheckpointStoreAdapter.ts';
import { CborIndexStoreAdapter } from '../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import { CborPatchJournalAdapter } from '../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import InMemoryBlobStorageAdapter from './InMemoryBlobStorageAdapter.ts';

export type MemoryRuntimeStorageAdapterOptions = {
  readonly history: CorePersistence;
};

/** Semantic runtime storage services for the supported in-memory backend. */
export default class MemoryRuntimeStorageAdapter implements RuntimeStorageProviderPort {
  private readonly _history: CorePersistence;
  private readonly _content = new InMemoryBlobStorageAdapter();

  constructor(options: MemoryRuntimeStorageAdapterOptions) {
    this._history = options.history;
  }

  createRuntimeStorageServices(request: RuntimeStorageRequest): Promise<RuntimeStorageServices> {
    const content = request.contentOverride ?? this._content;
    return Promise.resolve(
      Object.freeze({
        content,
        patchJournal: this._createPatchJournal(request),
        checkpoints: new CborCheckpointStoreAdapter({
          codec: request.codec,
          blobPort: this._history,
        }),
        indexes: new CborIndexStoreAdapter({
          codec: request.codec,
          blobPort: this._history,
          treePort: this._history,
          blobStorage: content,
        }),
      })
    );
  }

  private _createPatchJournal(request: RuntimeStorageRequest): CborPatchJournalAdapter {
    const patchContent: BlobStoragePort | undefined = request.patchContentOverride;
    return new CborPatchJournalAdapter({
      codec: request.codec,
      blobPort: this._history,
      commitPort: this._history,
      commitMessageCodec: request.commitMessageCodec,
      ...(patchContent === undefined
        ? { writeStorage: LEGACY_GIT_BLOB_PATCH_STORAGE }
        : {
            legacyPatchBlobStorage: patchContent,
            writeStorage: LEGACY_EXTERNAL_PATCH_STORAGE,
          }),
    });
  }
}
