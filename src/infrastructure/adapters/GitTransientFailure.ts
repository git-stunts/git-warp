import { GitRepositoryLockedError } from '@git-stunts/plumbing/errors';
import PersistenceError from '../../domain/errors/PersistenceError.ts';

/**
 * The failures a retry can clear, as their real producers throw them (#1079). The
 * history adapter types a ref it cannot lock or read for permission as
 * `PersistenceError` `E_REF_IO`; plumbing's own classifier throws a held lock file as
 * `GitRepositoryLockedError`, which reaches a host unwrapped. Nothing else counts.
 */
const TRANSIENT_PERSISTENCE_CODES: ReadonlySet<string> = Object.freeze(new Set([PersistenceError.E_REF_IO]));
const TRANSIENT_HOST_ERRORS = Object.freeze([GitRepositoryLockedError]);

/**
 * Whether a host failure is one a retry can clear. Unavailable is a positive verdict: the
 * cone store host, the write-attempt journal and the observation support host (#1109) each
 * give it only to these failures. Corruption, every git-cas code, a `GitProtocolError`, any
 * other plumbing failure, a defect and an error none can identify are not transient.
 */
export function isTransientGitFailure(error: Error): boolean {
  if (error instanceof PersistenceError) {
    return TRANSIENT_PERSISTENCE_CODES.has(error.code);
  }
  return TRANSIENT_HOST_ERRORS.some((transient) => error instanceof transient);
}
