import type ReadIdentity from './ReadIdentity.ts';

export default class NodeOpticReadResult {
  readonly nodeId: string;
  readonly alive: boolean;
  readonly readIdentity: ReadIdentity;

  constructor(options: {
    readonly nodeId: string;
    readonly alive: boolean;
    readonly readIdentity: ReadIdentity;
  }) {
    this.nodeId = options.nodeId;
    this.alive = options.alive;
    this.readIdentity = options.readIdentity;
    Object.freeze(this);
  }
}
