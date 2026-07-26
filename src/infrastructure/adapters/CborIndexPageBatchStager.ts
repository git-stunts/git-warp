import IndexError from '../../domain/errors/IndexError.ts';
import type ArtifactStagingPort from '../../ports/ArtifactStagingPort.ts';

const MAX_BATCH_BYTES = 32 * 1024 * 1024;
const MAX_BATCH_PAGES = 256;

type EncodedShard = Readonly<[path: string, bytes: Uint8Array]>;
type PageBatchStaging = ArtifactStagingPort & Required<
  Pick<ArtifactStagingPort, 'stagePages'>
>;

/** Bounded bridge from encoded index shards to one retained page batch. */
export class CborIndexPageBatchStager {
  readonly #staging: PageBatchStaging;
  readonly #maxPageBytes: number;
  readonly #batch: EncodedShard[] = [];
  #batchBytes = 0;

  constructor(staging: PageBatchStaging, maxPageBytes: number) {
    this.#staging = staging;
    this.#maxPageBytes = maxPageBytes;
  }

  async append(
    path: string,
    bytes: Uint8Array,
    members: Array<[string, string]>,
  ): Promise<void> {
    if (this.#wouldExceedBatch(bytes) && this.#batch.length > 0) {
      await this.flush(members);
    }
    this.#batch.push([path, bytes]);
    this.#batchBytes += bytes.byteLength;
    if (
      this.#batch.length >= MAX_BATCH_PAGES
      || this.#batchBytes >= MAX_BATCH_BYTES
    ) {
      await this.flush(members);
    }
  }

  async flush(members: Array<[string, string]>): Promise<void> {
    if (this.#batch.length === 0) {
      return;
    }
    const handles: unknown = await this.#staging.stagePages(
      this.#batch.map(([, bytes]) => bytes),
      {
        maxBytes: this.#maxPageBytes,
        maxBatchBytes: MAX_BATCH_BYTES,
        maxBatchPages: MAX_BATCH_PAGES,
      },
    );
    requireOrderedHandles(handles, this.#batch.length);
    this.#batch.forEach(([path], index) => {
      members.push([path, handles[index] as string]);
    });
    this.#batch.length = 0;
    this.#batchBytes = 0;
  }

  #wouldExceedBatch(bytes: Uint8Array): boolean {
    return this.#batch.length >= MAX_BATCH_PAGES
      || this.#batchBytes + bytes.byteLength > MAX_BATCH_BYTES;
  }
}

export function createCborIndexPageBatchStager(
  staging: ArtifactStagingPort | undefined,
  maxPageBytes: number,
): CborIndexPageBatchStager | undefined {
  return typeof staging?.stagePages === 'function'
    ? new CborIndexPageBatchStager(staging as PageBatchStaging, maxPageBytes)
    : undefined;
}

function requireOrderedHandles(
  handles: unknown,
  expected: number,
): asserts handles is readonly string[] {
  if (
    !Array.isArray(handles)
    || handles.length !== expected
    || handles.some((handle) => typeof handle !== 'string' || handle.length === 0)
  ) {
    throw new IndexError('Staged page batch returned invalid ordered handles', {
      code: 'E_INDEX_INVALID_STORAGE',
      context: {
        expected,
        actual: Array.isArray(handles) ? handles.length : null,
      },
    });
  }
}
