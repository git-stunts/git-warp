/**
 * Op — abstract base class for all WARP operations.
 *
 * Provides runtime identity (`instanceof Op`) and the `type` discriminator
 * field for serialization compatibility. Subclasses carry validated,
 * frozen payloads.
 *
 * Direct instantiation throws — use a concrete subclass.
 *
 * @module domain/types/ops/Op
 */

/**
 * Abstract base for WARP graph operations.
 */
export default class Op {
  /** Operation type discriminator (matches wire format) */
  readonly type: string;

  /**
   * Creates an Op. Not instantiable directly — use a concrete subclass.
   */
  constructor(type: string) {
    if (new.target === Op) {
      throw new Error('Op is abstract — use a concrete subclass (NodeAdd, EdgeAdd, etc.)');
    }
    if (typeof type !== 'string' || type.length === 0) {
      throw new Error('Op type must be a non-empty string');
    }
    this.type = type;
  }
}
