import { getExitCode, gitDiagnosticText, toGitError } from './gitErrorClassification.ts';

const GIT_FATAL_EXIT = 128;
const TREE_PARSE_FAILURE = 'TREE_PARSE_ERROR';
const REFUSED_READ = 'permission denied';
const OBJECT_DAMAGE: readonly string[] = ['bad file', 'corrupt', 'header for', 'unable to parse', 'not a valid object', 'bad object'];

/**
 * True when Git, or the store's tree parser, read an object and found it damaged or
 * not what was asked for. A spawn failure, a timeout, a lost repository or a refused
 * read says nothing about the object, and must surface as uncertainty, not damage.
 */
export function isObjectFault(cause: unknown): boolean {
  if (Object(cause) === cause && Reflect.get(Object(cause), 'code') === TREE_PARSE_FAILURE) {
    return true;
  }
  const error = toGitError(cause);
  const diagnostic = gitDiagnosticText(error);
  const damaged = OBJECT_DAMAGE.some((pattern) => diagnostic.includes(pattern)) && !diagnostic.includes(REFUSED_READ);
  return getExitCode(error) === GIT_FATAL_EXIT && damaged;
}
