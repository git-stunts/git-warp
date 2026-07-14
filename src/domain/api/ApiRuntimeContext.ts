import type ReadIdentity from '../services/optic/ReadIdentity.ts';
import type { Receipt } from './Receipt.ts';

export type ReceiptProvenance =
  | {
      readonly operation: 'write';
      readonly patchSha: string | undefined;
    }
  | {
      readonly operation: 'read';
      readonly identity: ReadIdentity | undefined;
    }
  | {
      readonly operation: 'join';
      readonly patchShas: readonly string[];
    };

export type OpaqueIdPart = string | number;

export type ApiRuntimeContext = {
  readonly createOpaqueId: (
    namespace: 'tick' | 'evidence',
    parts: readonly OpaqueIdPart[]
  ) => Promise<string>;
  readonly bindReceipt: (receipt: Receipt, provenance: ReceiptProvenance) => void;
};
