import type PatchEntry from '../../artifacts/PatchEntry.ts';
import { entityAdmissionsFromPatch } from '../../entity/EntityAdmissionPatchReader.ts';
import type RetainedEntityAdmission from '../../entity/RetainedEntityAdmission.ts';
import WarpError from '../../errors/WarpError.ts';
import ConeAdmissionRecord from './ConeAdmissionRecord.ts';
import type ConeAdmissionTally from './ConeAdmissionTally.ts';
import type ConeFoldSession from './ConeFoldSession.ts';
import ConeRecordKey from './ConeRecordKey.ts';
import ConeUnprovenAdmissionRecord from './ConeUnprovenAdmissionRecord.ts';

type IndexedAdmission = ConeAdmissionRecord | ConeUnprovenAdmissionRecord;
type Proof = readonly RetainedEntityAdmission[] | WarpError;

/**
 * Indexes the entity admissions one folded patch carries (#1039): each
 * becomes the next entry of its writer chain's admission order, after the
 * chain's tally. A patch whose admissions cannot be proven from its retained
 * form takes one unproven entry carrying the refusal instead, so the fold
 * goes on and only an inventory that reaches that entry is refused. A patch
 * without admissions reads and writes nothing here.
 */
export default class ConeAdmissionIndexer {
  /** The entry records and new tally to stage for `entry`, or nothing. */
  static async index(session: ConeFoldSession, entry: PatchEntry): Promise<ReadonlyArray<IndexedAdmission | ConeAdmissionTally>> {
    const proof = provenAdmissions(entry);
    const count = proof instanceof WarpError ? 1 : proof.length;
    if (count === 0) {
      return [];
    }
    const writerId = entry.patch.writer;
    const tally = (await session.read([ConeRecordKey.forAdmissionTally(writerId)])).admissionTally(writerId);
    const entries = proof instanceof WarpError
      ? [unproven(entry, tally.count, proof)]
      : proof.map((admission, index) => new ConeAdmissionRecord({ writerId, ordinal: tally.count + index, admission }));
    return [...entries, tally.advancedBy(count)];
  }
}

function provenAdmissions(entry: PatchEntry): Proof {
  try {
    return entityAdmissionsFromPatch(entry);
  } catch (error) {
    if (error instanceof WarpError) {
      return error;
    }
    throw error;
  }
}

function unproven(entry: PatchEntry, ordinal: number, refusal: WarpError): ConeUnprovenAdmissionRecord {
  return new ConeUnprovenAdmissionRecord({
    writerId: entry.patch.writer, ordinal, patchSha: entry.sha, code: refusal.code, message: refusal.message,
  });
}
