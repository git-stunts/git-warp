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

  /**
   * Executes an intent or an atomic intent sequence, publishing at most once. It is never
   * retried for you. An unavailable store before publication is permitted, whether fixing the
   * basis or reading its records, returns an unpublished receipt. Before publication it rejects,
   * having published nothing, when the input is not a valid intent sequence, when the injected
   * access port throws, or when the failure is a defect, a broken invariant or corruption rather
   * than an unavailable store.
   * A process that dies here leaves no receipt, and no way yet to ask what became of the write.
   */
  async execute(input: WriteIntentInput): Promise<AuthoredWriteReceipt> {
    return await this.#backend.execute(this.writer, input);
  }

  /**
   * Asks again what became of an indeterminate or unretained write's `attempt`. Ask again
   * while it stays so; a final answer is given once. Null means it was already answered, was
   * never this writer's, this writer is denied now, or a sweep finished it first. It does not
   * mean the write did not land. It rejects if a store read fails: it reads after an attempt
   * exists, so contract section 7 governs it, not the pre-permission rule.
   */
  async reconcile(attempt: string): Promise<AuthoredWriteReceipt | null> {
    return await this.#backend.reconcile(this.writer, attempt);
  }

  /** Stages text for a later attach intent on this Warp, changing nothing in the graph until then. Binary staging is still only on `Lane`. */
  async stage(content: string, metadata?: ContentMetadataInput): Promise<StagedContent | WarpAccessDenied> {
    return await this.#backend.stage(this.writer, { content, metadata });
  }
}
