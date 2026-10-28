import type { OpticReadIdentity } from './OpticReadIdentity.ts';

export default class NodeOpticReadResult {
  readonly nodeId: string;
  readonly alive: boolean;
  readonly readIdentity: OpticReadIdentity;

  constructor(options: {
    readonly nodeId: string;
    readonly alive: boolean;
    readonly readIdentity: OpticReadIdentity;
  }) {
    this.nodeId = options.nodeId;
    this.alive = options.alive;
    this.readIdentity = options.readIdentity;
    Object.freeze(this);
  }
}
