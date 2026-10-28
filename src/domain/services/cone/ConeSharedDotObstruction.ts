import type { Dot } from '../../crdt/Dot.ts';
import ConeObstruction from './ConeObstruction.ts';
import type { ConeDotSet } from './ConeRecordKey.ts';

/**
 * A patch claims a dot that another element of the same OR-Set also claims,
 * and at least one claim is a remove (#1022). The reducer's global tombstone
 * would hide every element tagged with that dot; per-element cone records
 * cannot represent that, so the fold stops instead of guessing.
 */
export default class ConeSharedDotObstruction extends ConeObstruction {
  readonly code = 'E_CONE_SHARED_DOT';
  readonly set: ConeDotSet;
  readonly dot: Dot;
  readonly elements: readonly string[];
  readonly patchSha: string;

  constructor(fields: {
    readonly set: ConeDotSet;
    readonly dot: Dot;
    readonly elements: Iterable<string>;
    readonly patchSha: string;
  }) {
    super();
    this.set = fields.set;
    this.dot = fields.dot;
    this.elements = Object.freeze([...fields.elements].sort());
    this.patchSha = fields.patchSha;
    Object.freeze(this);
  }

  describe(): string {
    return `Patch ${this.patchSha} claims ${this.set} dot ${this.dot.writerId}:${this.dot.counter} `
      + `that ${this.elements.length} elements share; repair the duplicate dot first`;
  }
}
