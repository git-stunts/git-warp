import type { EventId } from '../../utils/EventId.ts';
import AssetHandle from '../../storage/AssetHandle.ts';
import WarpError from '../../errors/WarpError.ts';
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
  readonly contentHandle: AssetHandle;
  readonly retainedPayloadByteHash: string | null;
  readonly eventId: EventId;

  constructor(options: {
    readonly owner: string;
    readonly contentHandle: AssetHandle;
    readonly retainedPayloadByteHash?: string | null;
    readonly eventId: EventId;
  }) {
    super();
    this.owner = validateText(options.owner, 'owner');
    this.contentHandle = requireAssetHandle(options.contentHandle);
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
    return `${this.owner}:${this.contentHandle.toString()}:${eventSortKey(this.eventId)}`;
  }

  toTransport(): CheckpointBasisFactTransport {
    return {
      kind: this.kind,
      owner: this.owner,
      contentHandle: this.contentHandle.toString(),
      retainedPayloadByteHash: this.retainedPayloadByteHash,
      eventId: eventTransport(this.eventId),
    };
  }
}

function requireAssetHandle(value: AssetHandle): AssetHandle {
  if (value instanceof AssetHandle) {
    return value;
  }
  throw new WarpError(
    'Checkpoint content anchor requires an AssetHandle',
    'E_CHECKPOINT_CONTENT_HANDLE',
  );
}
