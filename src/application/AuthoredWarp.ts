import type { AuthoredWriteReceipt } from '../domain/api/AuthoredWriteReceipt.ts';
import type { ContentInput } from '../domain/api/ContentInput.ts';
import type { ContentMetadataInput } from '../domain/api/ContentMetadataInput.ts';
import type { WriteIntentInput } from '../domain/api/IntentSequence.ts';
import type StagedContent from '../domain/api/StagedContent.ts';

/** What an authored handle asks of its Warp. */
export type AuthoredWarpBackend = {
  execute(writer: string, input: WriteIntentInput): Promise<AuthoredWriteReceipt>;
  reconcile(writer: string, attempt: string): Promise<AuthoredWriteReceipt | null>;
  stage(writer: string, content: { readonly content: ContentInput; readonly metadata: ContentMetadataInput | undefined }): Promise<StagedContent>;
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

  /** Asks again what became of an indeterminate write's `attempt`. Null means nothing is left unfinished under that name. */
  async reconcile(attempt: string): Promise<AuthoredWriteReceipt | null> {
    return await this.#backend.reconcile(this.writer, attempt);
  }

  /** Stages content for a later attach intent on this Warp. Staged bytes alone change nothing in the graph. */
  async stage(content: ContentInput, metadata?: ContentMetadataInput): Promise<StagedContent> {
    return await this.#backend.stage(this.writer, { content, metadata });
  }
}
