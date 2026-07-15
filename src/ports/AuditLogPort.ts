import type StorageRetentionWitness from '../domain/storage/StorageRetentionWitness.ts';
import type { StagedAsset } from './AssetStoragePort.ts';

export type AppendAuditRecordRequest = Readonly<{
  graphName: string;
  writerId: string;
  expectedHead: string | null;
  parent: string | null;
  message: string;
  receipt: Uint8Array;
}>;

export type PublishedAuditRecord = Readonly<{
  sha: string;
  stagedReceipt: StagedAsset;
  retention: StorageRetentionWitness;
}>;

export type AuditLogEntry = Readonly<{
  sha: string;
  message: string;
  parents: readonly string[];
  receipt: Uint8Array;
}>;

/** Semantic persistence boundary for append-only audit receipt chains. */
export default abstract class AuditLogPort {
  abstract readHead(_graphName: string, _writerId: string): Promise<string | null>;

  abstract listWriterIds(_graphName: string): Promise<string[]>;

  abstract append(_request: AppendAuditRecordRequest): Promise<PublishedAuditRecord>;

  abstract readEntry(_sha: string): Promise<AuditLogEntry>;
}
