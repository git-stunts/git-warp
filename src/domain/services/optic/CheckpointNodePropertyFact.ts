import type { EventId } from '../../utils/EventId.ts';
import computeShardKey from '../../utils/shardKey.ts';
import type { PropValue } from '../../types/PropValue.ts';
import { CheckpointBasisFact } from './CheckpointBasisFactBase.ts';
import {
  eventSortKey,
  eventTransport,
  validateEventId,
  validatePropValue,
  validateText,
} from './CheckpointBasisFactValidation.ts';
import type {
  CheckpointBasisFactShardFamily,
  CheckpointBasisFactTransport,
} from './CheckpointBasisFactTypes.ts';

export class CheckpointNodePropertyFact extends CheckpointBasisFact {
  readonly kind = 'node-property' as const;
  readonly nodeId: string;
  readonly key: string;
  readonly value: PropValue;
  readonly eventId: EventId;

  constructor(options: {
    readonly nodeId: string;
    readonly key: string;
    readonly value: PropValue;
    readonly eventId: EventId;
  }) {
    super();
    this.nodeId = validateText(options.nodeId, 'nodeId');
    this.key = validateText(options.key, 'key');
    this.value = validatePropValue(options.value);
    this.eventId = validateEventId(options.eventId);
    Object.freeze(this);
  }

  shardFamily(): CheckpointBasisFactShardFamily {
    return 'node-property';
  }

  shardPath(): string {
    return `property_${computeShardKey(this.nodeId)}.cbor`;
  }

  sortKey(): string {
    return `${this.nodeId}:${this.key}:${eventSortKey(this.eventId)}`;
  }

  toTransport(): CheckpointBasisFactTransport {
    return {
      kind: this.kind,
      nodeId: this.nodeId,
      key: this.key,
      value: this.value,
      eventId: eventTransport(this.eventId),
    };
  }
}
