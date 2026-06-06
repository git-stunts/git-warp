import type { EventId } from '../../utils/EventId.ts';
import computeShardKey from '../../utils/shardKey.ts';
import { CheckpointBasisFact } from './CheckpointBasisFactBase.ts';
import {
  eventSortKey,
  eventTransport,
  validateDirection,
  validateEventId,
  validateText,
} from './CheckpointBasisFactValidation.ts';
import type {
  CheckpointBasisFactShardFamily,
  CheckpointBasisFactTransport,
} from './CheckpointBasisFactTypes.ts';

export class CheckpointAdjacencyFact extends CheckpointBasisFact {
  readonly kind = 'adjacency' as const;
  readonly direction: 'outgoing' | 'incoming';
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly alive: boolean;
  readonly eventId: EventId;

  constructor(options: {
    readonly direction: 'outgoing' | 'incoming';
    readonly from: string;
    readonly to: string;
    readonly label: string;
    readonly alive: boolean;
    readonly eventId: EventId;
  }) {
    super();
    this.direction = validateDirection(options.direction);
    this.from = validateText(options.from, 'from');
    this.to = validateText(options.to, 'to');
    this.label = validateText(options.label, 'label');
    this.alive = options.alive;
    this.eventId = validateEventId(options.eventId);
    Object.freeze(this);
  }

  shardFamily(): CheckpointBasisFactShardFamily {
    return this.direction === 'outgoing' ? 'outgoing-adjacency' : 'incoming-adjacency';
  }

  shardPath(): string {
    const owner = this.direction === 'outgoing' ? this.from : this.to;
    return `${this.direction}_${computeShardKey(owner)}.cbor`;
  }

  sortKey(): string {
    return `${this.direction}:${this.from}:${this.to}:${this.label}:${eventSortKey(this.eventId)}`;
  }

  toTransport(): CheckpointBasisFactTransport {
    return {
      kind: this.kind,
      direction: this.direction,
      from: this.from,
      to: this.to,
      label: this.label,
      alive: this.alive,
      eventId: eventTransport(this.eventId),
    };
  }
}
