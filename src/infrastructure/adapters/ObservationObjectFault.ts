import { getExitCode, isTransientError, toGitError } from './gitErrorClassification.ts';

const GIT_FATAL_EXIT = 128;

/**
 * True when Git itself refused to read an object as what was asked, which makes the
 * object damaged. A spawn failure or a transient error says nothing about the object,
 * and must surface as uncertainty rather than as damage.
 */
export function isObjectFault(cause: unknown): boolean {
  const error = toGitError(cause);
  return getExitCode(error) === GIT_FATAL_EXIT && !isTransientError(error);
}
