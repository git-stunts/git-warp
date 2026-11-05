import type { AuthoredWriteReceipt } from '../domain/api/AuthoredWriteReceipt.ts';
import type { ContentMetadataInput } from '../domain/api/ContentMetadataInput.ts';
import type { WriteIntentInput } from '../domain/api/IntentSequence.ts';
import type StagedContent from '../domain/api/StagedContent.ts';
import type WarpAccessDenied from '../domain/api/WarpAccessDenied.ts';

/** What an authored handle asks of its Warp. */
export type AuthoredWarpBackend = {
  execute(writer: string, input: WriteIntentInput): Promise<AuthoredWriteReceipt>;
  reconcile(writer: string, attempt: string): Promise<AuthoredWriteReceipt | null>;
  stage(writer: string, content: { readonly content: string; readonly metadata: ContentMetadataInput | undefined }): Promise<StagedContent | WarpAccessDenied>;
};

/**
 * A Warp used as one writer. Each call asks the injected access boundary:
 * holding this handle authorizes nothing.
 */
export default class AuthoredWarp {
  readonly writer: string;
  readonly #backend: AuthoredWarpBackend;

  constructor(writer: string, backend: AuthoredWarpBackend) {
    this.writer = writer;
    this.#backend = backend;
    Object.freeze(this);
  }

  /** Executes an intent or an atomic intent sequence, publishing at most once. It is never retried for you. */
  async execute(input: WriteIntentInput): Promise<AuthoredWriteReceipt> {
    return await this.#backend.execute(this.writer, input);
  }

  /**
   * Asks again what became of an indeterminate or unretained write's `attempt`, whose answer
   * waits here until you ask. Null means it was already answered, was never this writer's, or
   * this writer is denied now. It does not mean the write did not land.
   */
  async reconcile(attempt: string): Promise<AuthoredWriteReceipt | null> {
    return await this.#backend.reconcile(this.writer, attempt);
  }

  /** Stages text for a later attach intent on this Warp, changing nothing in the graph until then. Binary staging is still only on `Lane`. */
  async stage(content: string, metadata?: ContentMetadataInput): Promise<StagedContent | WarpAccessDenied> {
    return await this.#backend.stage(this.writer, { content, metadata });
  }
}
