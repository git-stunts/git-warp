import type ContentStagingAuthority from '../services/ContentStagingAuthority.ts';
import type { OpticReadIdentity } from '../services/optic/OpticReadIdentity.ts';
import type { Receipt } from './Receipt.ts';

export type ReceiptProvenance =
  | {
      readonly operation: 'write';
      readonly patchSha: string | undefined;
    }
  | {
      readonly operation: 'read';
      readonly identity: OpticReadIdentity | undefined;
    }
  | {
      readonly operation: 'join';
      readonly patchShas: readonly string[];
    };

export type OpaqueIdPart = string | number;

export type ApiRuntimeContext = {
  readonly content?: ContentStagingAuthority;
  readonly createOpaqueId: (
    namespace: 'tick' | 'evidence' | 'admission',
    parts: readonly OpaqueIdPart[]
  ) => Promise<string>;
  readonly reserveRecoveryNonce: () => string;
  readonly bindReceipt: (receipt: Receipt, provenance: ReceiptProvenance) => void;
};
