import type {
  CheckpointBasisFactShardFamily,
  CheckpointBasisFactTransport,
} from './CheckpointBasisFactTypes.ts';

export abstract class CheckpointBasisFact {
  abstract readonly kind: CheckpointBasisFactTransport['kind'];

  abstract shardFamily(): CheckpointBasisFactShardFamily;

  abstract shardPath(): string;

  abstract sortKey(): string;

  abstract toTransport(): CheckpointBasisFactTransport;
}
