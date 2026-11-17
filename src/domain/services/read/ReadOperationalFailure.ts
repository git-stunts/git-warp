import ConeRecordError from '../../errors/ConeRecordError.ts';
import ConeStoreUnavailableError from '../../errors/ConeStoreUnavailableError.ts';
import PersistenceError from '../../errors/PersistenceError.ts';
import SyncError from '../../errors/SyncError.ts';
import WarpError from '../../errors/WarpError.ts';

const RECORD_FAILURES: ReadonlySet<string> = new Set(['E_CONE_RECORD_CORRUPT', 'E_CONE_LAYOUT_UNSUPPORTED']);
const PERSISTENCE_FAILURES: ReadonlySet<string> = new Set([
  PersistenceError.E_MISSING_OBJECT, PersistenceError.E_REF_NOT_FOUND, PersistenceError.E_REF_IO,
]);
const SUBSTRATE_FAILURES: ReadonlySet<string> = new Set([
  'E_SUBSTRATE_VERSION_UNSUPPORTED', 'E_SUBSTRATE_MARKER_MISSING', 'E_SUBSTRATE_MIGRATION_REQUIRED',
]);
const HISTORY_FAILURES: ReadonlySet<string> = new Set(['E_SYNC_PATCH_HISTORY']);

/**
 * The operational failures that the cone and storage boundaries actually produce: each one
 * settles the read's receipt as failed, with its code as the cause. Anything else is a defect:
 * a constructor invariant, an unrecognized code, or an error of the wrong family. A defect
 * while the basis opens or advances rejects `read()`. A defect while the read runs reaches a
 * consumer that iterates it as an exception. On a read nobody iterates (receipt demand alone),
 * the receipt settles as failed with cause `observation-failed`, and the error goes to the
 * Warp's logger at error level. Substrate admission uses WarpError directly, and is recognized
 * only while opening.
 */
export default function readOperationalFailure(error: Error, phase: 'opening' | 'reading'): string | null {
  if (!(error instanceof WarpError)) { return null; }
  if (error instanceof ConeStoreUnavailableError) {
    return error.code;
  }
  const codes = failureCodes(error);
  return codes === null ? substrateFailure(error, phase) : codeIn(error, codes);
}

function failureCodes(error: WarpError): ReadonlySet<string> | null {
  if (error instanceof ConeRecordError) { return RECORD_FAILURES; }
  if (error instanceof PersistenceError) {
    return PERSISTENCE_FAILURES;
  }
  return error instanceof SyncError ? HISTORY_FAILURES : null;
}

function substrateFailure(error: WarpError, phase: 'opening' | 'reading'): string | null {
  return phase === 'opening' ? codeIn(error, SUBSTRATE_FAILURES) : null;
}

function codeIn(error: WarpError, codes: ReadonlySet<string>): string | null {
  return codes.has(error.code) ? error.code : null;
}
