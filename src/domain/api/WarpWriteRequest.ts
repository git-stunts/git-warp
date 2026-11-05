import type Intent from './Intent.ts';

/** What the access boundary is asked to authorize before any premise is read. */
export default class WarpWriteRequest {
  readonly graph: string;
  readonly writer: string;
  readonly purpose: string;
  readonly intents: readonly Intent[];

  constructor(fields: {
    readonly graph: string;
    readonly writer: string;
    readonly purpose: string;
    readonly intents: readonly Intent[];
  }) {
    this.graph = fields.graph;
    this.writer = fields.writer;
    this.purpose = fields.purpose;
    this.intents = Object.freeze([...fields.intents]);
    Object.freeze(this);
  }
}
