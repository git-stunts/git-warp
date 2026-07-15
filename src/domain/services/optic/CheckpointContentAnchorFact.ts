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

export class CheckpointContentAnchorFact extends CheckpointBasisFact {
  readonly kind = 'content-anchor' as const;
  readonly owner: string;
  readonly contentHandle: string;
  readonly retainedPayloadByteHash: string | null;
  readonly eventId: EventId;

  constructor(options: {
    readonly owner: string;
    readonly contentHandle: string;
    readonly retainedPayloadByteHash?: string | null;
    readonly eventId: EventId;
  }) {
    super();
    this.owner = validateText(options.owner, 'owner');
    this.contentHandle = validateText(options.contentHandle, 'contentHandle');
    this.retainedPayloadByteHash = options.retainedPayloadByteHash === undefined
      || options.retainedPayloadByteHash === null
      ? null
      : validateText(options.retainedPayloadByteHash, 'retainedPayloadByteHash');
    this.eventId = validateEventId(options.eventId);
    Object.freeze(this);
  }

  shardFamily(): CheckpointBasisFactShardFamily {
    return 'content-anchor';
  }

  shardPath(): string {
    return `content_${computeShardKey(this.owner)}.cbor`;
  }

  sortKey(): string {
    return `${this.owner}:${this.contentHandle}:${eventSortKey(this.eventId)}`;
  }

  toTransport(): CheckpointBasisFactTransport {
    return {
      kind: this.kind,
      owner: this.owner,
      contentHandle: this.contentHandle,
      retainedPayloadByteHash: this.retainedPayloadByteHash,
      eventId: eventTransport(this.eventId),
    };
  }
}
