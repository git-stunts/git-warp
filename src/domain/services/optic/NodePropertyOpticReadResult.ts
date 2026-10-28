import type { Plurality } from '../../api/Plurality.ts';
import type { PropValue } from '../../types/PropValue.ts';
import type { OpticReadIdentity } from './OpticReadIdentity.ts';

export default class NodePropertyOpticReadResult {
  readonly nodeId: string;
  readonly key: string;
  readonly exists: boolean;
  readonly value: PropValue | undefined;
  readonly readIdentity: OpticReadIdentity;
  /** Concurrency the read observed (#1039): a register race or a delete raced by an edit; empty when none. */
  readonly plurality: readonly Plurality[];

  constructor(options: {
    readonly nodeId: string;
    readonly key: string;
    readonly value: PropValue | undefined;
    readonly readIdentity: OpticReadIdentity;
    readonly plurality?: readonly Plurality[];
  }) {
    this.nodeId = options.nodeId;
    this.key = options.key;
    this.exists = options.value !== undefined;
    this.value = options.value;
    this.readIdentity = options.readIdentity;
    this.plurality = Object.freeze([...(options.plurality ?? [])]);
    Object.freeze(this);
  }
}
