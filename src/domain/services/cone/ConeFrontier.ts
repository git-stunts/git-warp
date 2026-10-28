import { compareStrings } from '../../utils/StringComparison.ts';
import ConeRecordError from '../../errors/ConeRecordError.ts';
import MintId from '../../crdt/MintId.ts';
import ConeWriterPosition from './ConeWriterPosition.ts';

/**
 * Per writer chain, the last patch a cone basis has folded. A chain is named
 * by its mint id: a lane writer's bare id, or a strand writer's
 * `@w.<writer>@s.<strand>` (#1014). A chain absent from the frontier has had
 * nothing folded yet.
 */
export default class ConeFrontier {
  readonly #positions: ReadonlyMap<string, ConeWriterPosition>;

  constructor(positions: ReadonlyMap<string, ConeWriterPosition>) {
    if (!(positions instanceof Map)) {
      throw new ConeRecordError('Cone frontier positions must be a Map');
    }
    for (const [writerId, position] of positions) {
      MintId.decode(writerId);
      if (!(position instanceof ConeWriterPosition)) {
        throw new ConeRecordError('Cone frontier entries must be writer positions', { context: { writerId } });
      }
    }
    this.#positions = new Map([...positions].sort(([left], [right]) => compareStrings(left, right)));
    Object.freeze(this);
  }

  static empty(): ConeFrontier {
    return new ConeFrontier(new Map());
  }

  /** The folded position of a writer, or null when nothing of it is folded. */
  position(writerId: string): ConeWriterPosition | null {
    return this.#positions.get(writerId) ?? null;
  }

  /** This frontier with `writerId` advanced to `position`. */
  advanced(writerId: string, position: ConeWriterPosition): ConeFrontier {
    return new ConeFrontier(new Map([...this.#positions, [writerId, position]]));
  }

  /** Writer positions in writer-id order. */
  entries(): ReadonlyArray<readonly [string, ConeWriterPosition]> {
    return Object.freeze([...this.#positions]);
  }

  equals(other: ConeFrontier): boolean {
    const entries = other.entries();
    return entries.length === this.#positions.size
      && entries.every(([writerId, position]) => this.position(writerId)?.equals(position) === true);
  }
}
