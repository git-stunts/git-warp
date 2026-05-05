import type { PropValue } from '../../types/PropValue.ts';
import type ReadIdentity from './ReadIdentity.ts';

export default class NodePropertyOpticReadResult {
  readonly nodeId: string;
  readonly key: string;
  readonly exists: boolean;
  readonly value: PropValue | undefined;
  readonly readIdentity: ReadIdentity;

  constructor(options: {
    readonly nodeId: string;
    readonly key: string;
    readonly value: PropValue | undefined;
    readonly readIdentity: ReadIdentity;
  }) {
    this.nodeId = options.nodeId;
    this.key = options.key;
    this.exists = options.value !== undefined;
    this.value = options.value;
    this.readIdentity = options.readIdentity;
    Object.freeze(this);
  }
}
