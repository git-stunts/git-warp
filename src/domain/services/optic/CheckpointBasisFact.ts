import QueryError from '../../errors/QueryError.ts';
import { isPropValue, type PropValue } from '../../types/PropValue.ts';
import computeShardKey from '../../utils/shardKey.ts';
import { EventId } from '../../utils/EventId.ts';
import type { CheckpointBasisRootFamily } from './CheckpointBasisManifest.ts';

export type CheckpointBasisFactShardFamily =
  | CheckpointBasisRootFamily
  | 'provenance'
  | 'content-anchor';

export type CheckpointBasisFactTransport =
  | CheckpointNodeLivenessFactTransport
  | CheckpointNodePropertyFactTransport
  | CheckpointAdjacencyFactTransport
  | CheckpointEdgeFactTransport
  | CheckpointProvenanceFactTransport
  | CheckpointContentAnchorFactTransport;

type CheckpointFactEventTransport = {
  readonly lamport: number;
  readonly writerId: string;
  readonly patchSha: string;
  readonly opIndex: number;
};

type CheckpointNodeLivenessFactTransport = {
  readonly kind: 'node-liveness';
  readonly nodeId: string;
  readonly alive: boolean;
  readonly eventId: CheckpointFactEventTransport;
};

type CheckpointNodePropertyFactTransport = {
  readonly kind: 'node-property';
  readonly nodeId: string;
  readonly key: string;
  readonly value: PropValue;
  readonly eventId: CheckpointFactEventTransport;
};

type CheckpointAdjacencyFactTransport = {
  readonly kind: 'adjacency';
  readonly direction: 'outgoing' | 'incoming';
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly alive: boolean;
  readonly eventId: CheckpointFactEventTransport;
};

type CheckpointEdgeFactTransport = {
  readonly kind: 'edge-fact';
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly alive: boolean;
  readonly eventId: CheckpointFactEventTransport;
};

type CheckpointProvenanceFactTransport = {
  readonly kind: 'provenance';
  readonly target: string;
  readonly patchSha: string;
  readonly writerId: string;
  readonly lamport: number;
};

type CheckpointContentAnchorFactTransport = {
  readonly kind: 'content-anchor';
  readonly owner: string;
  readonly contentOid: string;
  readonly retainedPayloadByteHash: string | null;
  readonly eventId: CheckpointFactEventTransport;
};

export abstract class CheckpointBasisFact {
  abstract readonly kind: CheckpointBasisFactTransport['kind'];

  abstract shardFamily(): CheckpointBasisFactShardFamily;

  abstract shardPath(): string;

  abstract sortKey(): string;

  abstract toTransport(): CheckpointBasisFactTransport;
}

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

export class CheckpointContentAnchorFact extends CheckpointBasisFact {
  readonly kind = 'content-anchor' as const;
  readonly owner: string;
  readonly contentOid: string;
  readonly retainedPayloadByteHash: string | null;
  readonly eventId: EventId;

  constructor(options: {
    readonly owner: string;
    readonly contentOid: string;
    readonly retainedPayloadByteHash?: string | null;
    readonly eventId: EventId;
  }) {
    super();
    this.owner = validateText(options.owner, 'owner');
    this.contentOid = validateText(options.contentOid, 'contentOid');
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
    return `${this.owner}:${this.contentOid}:${eventSortKey(this.eventId)}`;
  }

  toTransport(): CheckpointBasisFactTransport {
    return {
      kind: this.kind,
      owner: this.owner,
      contentOid: this.contentOid,
      retainedPayloadByteHash: this.retainedPayloadByteHash,
      eventId: eventTransport(this.eventId),
    };
  }
}

function eventTransport(eventId: EventId): CheckpointFactEventTransport {
  return {
    lamport: eventId.lamport,
    writerId: eventId.writerId,
    patchSha: eventId.patchSha,
    opIndex: eventId.opIndex,
  };
}

function eventSortKey(eventId: EventId): string {
  return [
    String(eventId.lamport).padStart(12, '0'),
    eventId.writerId,
    eventId.patchSha,
    String(eventId.opIndex).padStart(8, '0'),
  ].join(':');
}

function validateDirection(direction: string): 'outgoing' | 'incoming' {
  if (direction !== 'outgoing' && direction !== 'incoming') {
    throwFactError('direction', 'invalid-direction');
  }
  return direction;
}

function validatePropValue(value: PropValue): PropValue {
  if (!isPropValue(value)) {
    throwFactError('value', 'invalid-property-value');
  }
  return value;
}

function validateEventId(eventId: EventId): EventId {
  if (!(eventId instanceof EventId)) {
    throwFactError('eventId', 'invalid-event-id');
  }
  return eventId;
}

function validateText(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throwFactError(field, 'empty-string');
  }
  return value;
}

function validatePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throwFactError(field, 'invalid-positive-integer');
  }
  return value;
}

function throwFactError(field: string, reason: string): never {
  throw new QueryError('Checkpoint basis fact is invalid.', {
    code: 'E_CHECKPOINT_BASIS_FACT',
    context: { field, reason },
  });
}
