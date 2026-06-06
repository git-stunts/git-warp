import computeShardKey from '../../utils/shardKey.ts';
import { CheckpointBasisFact } from './CheckpointBasisFactBase.ts';
import {
  validatePositiveInteger,
  validateText,
} from './CheckpointBasisFactValidation.ts';
import type {
  CheckpointBasisFactShardFamily,
  CheckpointBasisFactTransport,
} from './CheckpointBasisFactTypes.ts';

export class CheckpointProvenanceFact extends CheckpointBasisFact {
  readonly kind = 'provenance' as const;
  readonly target: string;
  readonly patchSha: string;
  readonly writerId: string;
  readonly lamport: number;

  constructor(options: {
    readonly target: string;
    readonly patchSha: string;
    readonly writerId: string;
    readonly lamport: number;
  }) {
    super();
    this.target = validateText(options.target, 'target');
    this.patchSha = validateText(options.patchSha, 'patchSha');
    this.writerId = validateText(options.writerId, 'writerId');
    this.lamport = validatePositiveInteger(options.lamport, 'lamport');
    Object.freeze(this);
  }

  shardFamily(): CheckpointBasisFactShardFamily {
    return 'provenance';
  }

  shardPath(): string {
    return `provenance_${computeShardKey(this.target)}.cbor`;
  }

  sortKey(): string {
    return `${this.target}:${this.lamport}:${this.writerId}:${this.patchSha}`;
  }

  toTransport(): CheckpointBasisFactTransport {
    return {
      kind: this.kind,
      target: this.target,
      patchSha: this.patchSha,
      writerId: this.writerId,
      lamport: this.lamport,
    };
  }
}
