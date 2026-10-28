import type { Plurality } from '../../api/Plurality.ts';
import type { OpticReadIdentity } from './OpticReadIdentity.ts';

export default class NodeOpticReadResult {
  readonly nodeId: string;
  readonly alive: boolean;
  readonly readIdentity: OpticReadIdentity;
  /** Concurrency the read observed (#1039): a register race or a delete raced by an edit; empty when none. */
  readonly plurality: readonly Plurality[];

  constructor(options: {
    readonly nodeId: string;
    readonly alive: boolean;
    readonly readIdentity: OpticReadIdentity;
    readonly plurality?: readonly Plurality[];
  }) {
    this.nodeId = options.nodeId;
    this.alive = options.alive;
    this.readIdentity = options.readIdentity;
    this.plurality = Object.freeze([...(options.plurality ?? [])]);
    Object.freeze(this);
  }
}
