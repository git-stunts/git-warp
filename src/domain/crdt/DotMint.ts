import CrdtError from '../errors/CrdtError.ts';
import { Dot } from './Dot.ts';
import type VersionVector from './VersionVector.ts';

/**
 * The only producer of new dots for one writer chain.
 *
 * A dot must never be minted twice. Callers used to mint by incrementing
 * whatever version vector they had built, so one badly seeded vector reused
 * dots (#995). A mint starts at the chain head's high-water mark and only
 * moves forward: it can learn of a higher counter, never a lower one.
 */
export default class DotMint {
  readonly writerId: string;
  #issued: number;

  private constructor(writerId: string, issued: number) {
    if (typeof writerId !== 'string' || writerId.length === 0) {
      throw new CrdtError('DotMint writerId must be a non-empty string', {
        code: 'E_CRDT_INVALID_WRITER_ID',
        context: { writerId },
      });
    }
    if (!Number.isSafeInteger(issued) || issued < 0) {
      throw new CrdtError('DotMint high-water mark must be a non-negative safe integer', {
        code: 'E_CRDT_INVALID_COUNTER',
        context: { writerId, issued },
      });
    }
    this.writerId = writerId;
    this.#issued = issued;
    Object.freeze(this);
  }

  /** A mint whose writer has already used every counter up to `issued`. */
  static after(writerId: string, issued: number): DotMint {
    return new DotMint(writerId, issued);
  }

  /** Returns this mint if it mints for `writerId`; a builder must not mint another writer's dots. */
  requireWriter(writerId: string): DotMint {
    if (writerId !== this.writerId) {
      throw new CrdtError('DotMint belongs to a different writer', {
        code: 'E_CRDT_DOT_MINT_WRITER',
        context: { expected: writerId, actual: this.writerId },
      });
    }
    return this;
  }

  /** Highest counter this writer is known to have used. */
  get issued(): number {
    return this.#issued;
  }

  /** The dot the next {@link issue} call will return. */
  peek(): Dot {
    return new Dot(this.writerId, this.#issued + 1);
  }

  /** Raises the high-water mark to this writer's entry in `context`, then returns `context`. */
  observed(context: VersionVector): VersionVector {
    this.#issued = Math.max(this.#issued, context.get(this.writerId) ?? 0);
    return context;
  }

  /**
   * Issues the next dot. The mint never touches a caller's version vector;
   * the patch owner records the dot in its own context.
   */
  issue(): Dot {
    const dot = this.peek();
    this.#issued = dot.counter;
    return dot;
  }
}
