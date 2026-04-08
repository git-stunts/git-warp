/**
 * Op — abstract base class for all WARP operations.
 *
 * Provides runtime identity (`instanceof Op`) and the `type` discriminator
 * field for serialization compatibility. Subclasses carry validated,
 * frozen payloads.
 *
 * Direct instantiation throws — use a concrete subclass.
 */

import PatchError from '../../errors/PatchError.ts';

/** Abstract base for WARP graph operations. */
export default class Op {
  /** Operation type discriminator (matches wire format). */
  readonly type: string;

  /** Bit flags indicating raw, canonical, or both. See OpScope.ts. */
  readonly scope: number;

  /** Creates an Op. Not instantiable directly — use a concrete subclass. */
  constructor(type: string, scope: number) {
    if (new.target === Op) {
      throw new PatchError('Op is abstract — use a concrete subclass (NodeAdd, EdgeAdd, etc.)', {
        code: 'E_OP_ABSTRACT',
      });
    }
    if (typeof type !== 'string' || type.length === 0) {
      throw new PatchError('Op type must be a non-empty string', {
        code: 'E_OP_INVALID_TYPE',
      });
    }
    this.type = type;
    this.scope = scope;
  }
}
