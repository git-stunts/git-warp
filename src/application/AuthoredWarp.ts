import type { WriteReceipt } from '../domain/api/WriteReceipt.ts';
import type { ContentMetadataInput } from '../domain/api/ContentMetadataInput.ts';
import type { WriteIntentInput } from '../domain/api/IntentSequence.ts';
import type StagedContent from '../domain/api/StagedContent.ts';
import type WarpAccessDenied from '../domain/api/WarpAccessDenied.ts';

/** What an authored handle asks of its Warp. */
export type AuthoredWarpBackend = {
  execute(writer: string, input: WriteIntentInput): Promise<WriteReceipt>;
  reconcile(writer: string, attempt: string): Promise<WriteReceipt | null>;
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
   * retried for you. An unavailable store while it fixes the basis or reads its records
   * returns an unpublished receipt. At those steps it rejects, having published nothing, when
   * the input is not a valid intent sequence, when the injected access port throws, or when the
   * failure is a defect, a broken invariant or corruption rather than an unavailable store. The
   * attempt-journal and custody-support steps still give an unpublished receipt for any failure,
   * until #1109 classifies them by type.
   * Before those steps, a granted call opens this Warp's write path (cone and custody) if no
   * earlier call has (#1078). If the path cannot open, the call rejects, having published nothing,
   * and that includes an unavailable store. Every granted `execute` or `reconcile` rejects so until
   * an open succeeds, and each one tries the open again. Only the retention store's failure is
   * typed: it rejects with code `E_WARP_RETENTION_OPEN`, where `refusal` is `policy-mismatch` when
   * the graph's saved capacity differs, which no retry clears; otherwise a retry can succeed, and
   * `cause` is the store's failure when it could not answer. A cone store that did not open
   * rejects with that store's own error, passed through and not classified. Nothing was
   * published in either case, so calling again is safe.
   * A process that dies here leaves no receipt, and no way yet to ask what became of the write.
   */
  async execute(input: WriteIntentInput): Promise<WriteReceipt> {
    return await this.#backend.execute(this.writer, input);
  }

  /**
   * Asks again what became of an indeterminate or unretained write's `attempt`. Ask again
   * while it stays so; a final answer is given once. Null means this build reads no record of
   * the attempt for this writer: it was already answered, was never this writer's, this writer
   * is denied now, or a sweep finished it first. Null is also the answer while the record still
   * exists under `refs/warp/<graph>/write-attempts/`, where only pre-release builds of `main`
   * saved it and this build does not read it; `docs/topics/sync.md` says how to finish such an
   * attempt. Null never means the write did not land. It rejects if a store read fails: it reads after an attempt
   * exists, so contract section 7 governs it, not the pre-permission rule. It also rejects, with code
   * `E_WRITE_ATTEMPT_LAYOUT_UNSUPPORTED`, when this writer's saved record uses a layout this
   * git-warp does not read; the error names the ref and says what to do. Another writer's such
   * record answers null, unless the record no longer names a readable writer, which refuses every
   * writer. It rejects with code `E_WRITE_CORE_MISMATCH`, keeping the record, when the record does
   * not rebuild the receipt core custody retained: the record is altered or corrupt. Report it; the
   * sweep does not yet. Races come from the record alone only when custody holds no settlement;
   * while custody's copy cannot be compared, the answer is indeterminate. Like `execute`, a
   * granted call rejects while this Warp's write path (cone and custody) cannot open, and the
   * next granted call tries the open again (#1078).
   */
  async reconcile(attempt: string): Promise<WriteReceipt | null> {
    return await this.#backend.reconcile(this.writer, attempt);
  }

  /** Stages text for a later attach intent on this Warp, changing nothing in the graph until then. It stages text only. */
  async stage(content: string, metadata?: ContentMetadataInput): Promise<StagedContent | WarpAccessDenied> {
    return await this.#backend.stage(this.writer, { content, metadata });
  }
}
