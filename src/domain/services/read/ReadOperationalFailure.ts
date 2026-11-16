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
 * The operational failures that the cone and storage boundaries actually produce.
 * Constructor defects, unknown codes and errors of the wrong family remain exceptions.
 * Substrate admission uses WarpError directly, and is recognized only while opening.
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
