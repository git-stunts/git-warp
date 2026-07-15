import type { PropValue } from '../../types/PropValue.ts';
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

export type CheckpointFactEventTransport = {
  readonly lamport: number;
  readonly writerId: string;
  readonly patchSha: string;
  readonly opIndex: number;
};

export type CheckpointNodeLivenessFactTransport = {
  readonly kind: 'node-liveness';
  readonly nodeId: string;
  readonly alive: boolean;
  readonly eventId: CheckpointFactEventTransport;
};

export type CheckpointNodePropertyFactTransport = {
  readonly kind: 'node-property';
  readonly nodeId: string;
  readonly key: string;
  readonly value: PropValue;
  readonly eventId: CheckpointFactEventTransport;
};

export type CheckpointAdjacencyFactTransport = {
  readonly kind: 'adjacency';
  readonly direction: 'outgoing' | 'incoming';
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly alive: boolean;
  readonly eventId: CheckpointFactEventTransport;
};

export type CheckpointEdgeFactTransport = {
  readonly kind: 'edge-fact';
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly alive: boolean;
  readonly eventId: CheckpointFactEventTransport;
};

export type CheckpointProvenanceFactTransport = {
  readonly kind: 'provenance';
  readonly target: string;
  readonly patchSha: string;
  readonly writerId: string;
  readonly lamport: number;
};

export type CheckpointContentAnchorFactTransport = {
  readonly kind: 'content-anchor';
  readonly owner: string;
  readonly contentHandle: string;
  readonly retainedPayloadByteHash: string | null;
  readonly eventId: CheckpointFactEventTransport;
};
