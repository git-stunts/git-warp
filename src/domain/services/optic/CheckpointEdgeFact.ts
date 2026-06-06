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

export class CheckpointEdgeFact extends CheckpointBasisFact {
  readonly kind = 'edge-fact' as const;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly alive: boolean;
  readonly eventId: EventId;

  constructor(options: {
    readonly from: string;
    readonly to: string;
    readonly label: string;
    readonly alive: boolean;
    readonly eventId: EventId;
  }) {
    super();
    this.from = validateText(options.from, 'from');
    this.to = validateText(options.to, 'to');
    this.label = validateText(options.label, 'label');
    this.alive = options.alive;
    this.eventId = validateEventId(options.eventId);
    Object.freeze(this);
  }

  shardFamily(): CheckpointBasisFactShardFamily {
    return 'edge-fact';
  }

  shardPath(): string {
    return `edge_${computeShardKey(`${this.from}\0${this.to}\0${this.label}`)}.cbor`;
  }

  sortKey(): string {
    return `${this.from}:${this.to}:${this.label}:${eventSortKey(this.eventId)}`;
  }

  toTransport(): CheckpointBasisFactTransport {
    return {
      kind: this.kind,
      from: this.from,
      to: this.to,
      label: this.label,
      alive: this.alive,
      eventId: eventTransport(this.eventId),
    };
  }
}
