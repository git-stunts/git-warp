import WarpError from '../domain/errors/WarpError.ts';
import type { ApiRuntimeContext, ReceiptProvenance } from '../domain/api/ApiRuntimeContext.ts';
import type { Receipt } from '../domain/api/Receipt.ts';
import type CryptoPort from '../ports/CryptoPort.ts';
import type WarpStorage from './WarpStorage.ts';
import { resolveWarpStorage } from './WarpStorageRegistry.ts';

type ReceiptProvenanceBinding = {
  readonly provenance: ReceiptProvenance;
  readonly storage: WarpStorage;
};

type RecoveryNonceState = {
  readonly nonce: string;
  sequence: number;
};

const RECEIPT_PROVENANCE = new WeakMap<Receipt, ReceiptProvenanceBinding>();
const RECOVERY_NONCES = new WeakMap<WarpStorage, RecoveryNonceState>();

export function createApiRuntimeContext(
  storage: WarpStorage,
  crypto: CryptoPort
): ApiRuntimeContext {
  return Object.freeze({
    createOpaqueId: async (namespace, parts) => {
      const digest = await crypto.hash('sha256', opaqueIdPayload(namespace, parts));
      return `${namespace}:${digest}`;
    },
    reserveRecoveryNonce: () => reserveRecoveryNonce(storage),
    bindReceipt: (receipt, provenance) => {
      if (RECEIPT_PROVENANCE.has(receipt)) {
        throw new WarpError('Receipt provenance is already bound', 'E_RECEIPT_PROVENANCE_BOUND');
      }
      RECEIPT_PROVENANCE.set(
        receipt,
        Object.freeze({ storage, provenance: freezeProvenance(provenance) })
      );
    },
  });
}

function reserveRecoveryNonce(storage: WarpStorage): string {
  let state = RECOVERY_NONCES.get(storage);
  if (state === undefined) {
    state = { nonce: globalThis.crypto.randomUUID(), sequence: 0 };
    RECOVERY_NONCES.set(storage, state);
  }
  state.sequence += 1;
  return `${state.nonce}:${state.sequence}`;
}

function opaqueIdPayload(namespace: string, parts: readonly (string | number)[]): string {
  return [namespace, ...parts].map(encodeOpaqueIdPart).join('');
}

function encodeOpaqueIdPart(part: string | number): string {
  const value = String(part);
  const type = typeof part === 'number' ? 'n' : 's';
  return `${type}${value.length}:${value}`;
}

export function resolveReceiptProvenance(
  receipt: Receipt,
  storage: WarpStorage
): ReceiptProvenance {
  resolveWarpStorage(storage);
  const binding = RECEIPT_PROVENANCE.get(receipt);
  if (binding === undefined) {
    throw new WarpError(
      'Receipt was not issued by an openWarp runtime',
      'E_RECEIPT_PROVENANCE_UNAVAILABLE'
    );
  }
  if (binding.storage !== storage) {
    throw new WarpError(
      'Receipt does not belong to the supplied storage',
      'E_RECEIPT_STORAGE_MISMATCH'
    );
  }
  return binding.provenance;
}

function freezeProvenance(provenance: ReceiptProvenance): ReceiptProvenance {
  if (provenance.operation === 'join') {
    return Object.freeze({
      operation: provenance.operation,
      patchShas: Object.freeze([...provenance.patchShas]),
    });
  }
  return Object.freeze({ ...provenance });
}
