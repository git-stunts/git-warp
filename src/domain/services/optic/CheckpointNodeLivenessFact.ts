import type { EventId } from '../../utils/EventId.ts';
import computeShardKey from '../../utils/shardKey.ts';
import { CheckpointBasisFact } from './CheckpointBasisFactBase.ts';
import {
  eventSortKey,
  eventTransport,
  validateEventId,
  validateText,
} from './CheckpointBasisFactValidation.ts';
import type {
  CheckpointBasisFactShardFamily,
  CheckpointBasisFactTransport,
} from './CheckpointBasisFactTypes.ts';

export class CheckpointNodeLivenessFact extends CheckpointBasisFact {
  readonly kind = 'node-liveness' as const;
  readonly nodeId: string;
  readonly alive: boolean;
  readonly eventId: EventId;

  constructor(options: {
    readonly nodeId: string;
    readonly alive: boolean;
    readonly eventId: EventId;
  }) {
    super();
    this.nodeId = validateText(options.nodeId, 'nodeId');
    this.alive = options.alive;
    this.eventId = validateEventId(options.eventId);
    Object.freeze(this);
  }

  shardFamily(): CheckpointBasisFactShardFamily {
    return 'node-liveness';
  }

  shardPath(): string {
    return `liveness_${computeShardKey(this.nodeId)}.cbor`;
  }

  sortKey(): string {
    return `${this.nodeId}:${eventSortKey(this.eventId)}`;
  }

  toTransport(): CheckpointBasisFactTransport {
    return {
      kind: this.kind,
      nodeId: this.nodeId,
      alive: this.alive,
      eventId: eventTransport(this.eventId),
    };
  }
}
