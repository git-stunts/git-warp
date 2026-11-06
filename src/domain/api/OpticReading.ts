import type { OpticValue } from './OpticValue.ts';

/** One answer an Optic emitted: whether its subject is present, and the value when it is a property. */
export default class OpticReading {
  readonly subject: string;
  /** The property asked about, or null for a question about the node itself. */
  readonly key: string | null;
  readonly present: boolean;
  readonly value: OpticValue | null;

  constructor(fields: {
    readonly subject: string;
    readonly key: string | null;
    readonly present: boolean;
    readonly value: OpticValue | null;
  }) {
    this.subject = fields.subject;
    this.key = fields.key;
    this.present = fields.present;
    this.value = fields.value;
    Object.freeze(this);
  }
}
