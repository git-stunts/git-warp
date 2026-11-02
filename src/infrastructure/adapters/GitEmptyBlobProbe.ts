import PersistenceError from '../../domain/errors/PersistenceError.ts';
import { getExitCode, gitDiagnosticText, toGitError, wrapGitError } from './gitErrorClassification.ts';

/**
 * Distinguishes a legitimate zero-byte blob from a missing object when a
 * blob stream returns no bytes: `cat-file -e` exits 1 without diagnostics
 * only for an object that is not there.
 */
export async function assertBlobExistsForEmptyRead(
  execute: (args: string[]) => Promise<string>,
  oid: string,
): Promise<void> {
  try {
    await execute(['cat-file', '-e', oid]);
  } catch (raw) {
    const err = toGitError(raw);
    const wrapped = wrapGitError(err, { oid });
    const ambiguousMissingObject = getExitCode(err) === 1 && gitDiagnosticText(err) === '';
    if (wrapped === err && ambiguousMissingObject) {
      throw new PersistenceError(`Missing Git object: ${oid}`, PersistenceError.E_MISSING_OBJECT, { cause: err, context: { oid } });
    }
    throw wrapped;
  }
}
