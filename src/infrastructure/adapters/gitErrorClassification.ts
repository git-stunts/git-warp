/**
 * Git error classification and retry configuration for persistence adapters.
 *
 * Pure functions that classify raw Git plumbing errors into typed
 * PersistenceError categories. Extracted from GitGraphAdapter to keep
 * the adapter under the 500 LOC limit.
 */
import type { RetryOptions } from '@git-stunts/alfred';
import PersistenceError from '../../domain/errors/PersistenceError.ts';

// ---------------------------------------------------------------------------
// Types — shapes of errors and dependencies from the Git plumbing boundary
// ---------------------------------------------------------------------------

export interface GitErrorDetails {
  readonly stderr?: string;
  readonly stdout?: string;
  readonly code?: number;
}

/** Shape of errors produced by @git-stunts/plumbing commands. */
export interface GitError extends Error {
  readonly details?: GitErrorDetails;
  readonly exitCode?: number;
  readonly code?: number;
}

/** Shape of a stream with a collect() method from plumbing. */
export interface CollectableStream extends AsyncIterable<Uint8Array> {
  collect(opts?: { asString?: boolean }): Promise<Buffer | string>;
}

/** Minimal contract for the plumbing dependency injected into adapters. */
export interface GitPlumbing {
  readonly emptyTree: string;
  execute(options: { args: string[]; input?: string | Buffer }): Promise<string>;
  executeStream(options: { args: string[] }): Promise<CollectableStream>;
}

// ---------------------------------------------------------------------------
// Error pattern constants
// ---------------------------------------------------------------------------

/** Transient Git errors safe to retry (lock contention, I/O, timeout). */
const TRANSIENT_ERROR_PATTERNS: readonly string[] = [
  'cannot lock ref',
  'resource temporarily unavailable',
  'connection timed out',
];

/** Stderr patterns indicating a missing Git object. */
const MISSING_OBJECT_PATTERNS: readonly string[] = [
  'bad object',
  'not a valid object name',
  'does not point to a valid object',
  'missing object',
  'not a commit',
  'could not read',
];

/** Stderr patterns indicating a ref was not found. */
const REF_NOT_FOUND_PATTERNS: readonly string[] = [
  'not found',
  'does not exist',
  'unknown revision',
  'bad revision',
];

/** Stderr patterns indicating a ref I/O failure. */
const REF_IO_PATTERNS: readonly string[] = [
  'cannot lock ref',
  'unable to create',
  'permission denied',
  'failed to lock',
];

// ---------------------------------------------------------------------------
// Error inspection helpers
// ---------------------------------------------------------------------------

/** Extracts the exit code from a Git command error. */
export function getExitCode(err: GitError): number | undefined {
  return err.details?.code ?? err.exitCode ?? err.code;
}

/** Builds a lowercase search string from an error's message and stderr. */
function errorSearchText(err: GitError): string {
  const msg = err.message ?? '';
  const stderr = err.details?.stderr ?? '';
  return `${msg} ${stderr}`.toLowerCase();
}

/**
 * Returns stderr+stdout diagnostic text, ignoring wrapper messages
 * like "Git command failed with code 1" that carry no object-lookup semantics.
 */
export function gitDiagnosticText(err: GitError): string {
  const stderr = err.details?.stderr !== null && err.details?.stderr !== undefined ? String(err.details.stderr) : '';
  const stdout = err.details?.stdout !== null && err.details?.stdout !== undefined ? String(err.details.stdout) : '';
  return `${stderr} ${stdout}`.trim().toLowerCase();
}

/** Is the error transient and safe to retry? */
function isTransientError(error: Error): boolean {
  const gitErr = error as GitError;
  const message = (gitErr.message ?? '').toLowerCase();
  const stderr = (gitErr.details?.stderr ?? '').toLowerCase();
  const searchText = `${message} ${stderr}`;
  return TRANSIENT_ERROR_PATTERNS.some(pattern => searchText.includes(pattern));
}

/** Does the error indicate a dangling or missing Git object at exit code 128? */
export function isDanglingObjectError(err: GitError): boolean {
  if (getExitCode(err) !== 128) {
    return false;
  }
  const stderr = (err.details?.stderr ?? '').toLowerCase();
  return (
    stderr.includes('bad object') ||
    stderr.includes('not a valid object name') ||
    stderr.includes('does not point to a valid object')
  );
}

/** Does the error indicate a missing Git object? */
function isMissingObjectError(err: GitError): boolean {
  const code = getExitCode(err);
  if (code !== 128 && code !== 1) {
    return false;
  }
  const text = errorSearchText(err);
  return MISSING_OBJECT_PATTERNS.some(p => text.includes(p));
}

/** Does the error indicate a ref was not found? */
function isRefNotFoundError(err: GitError): boolean {
  const code = getExitCode(err);
  if (code !== 128 && code !== 1) {
    return false;
  }
  const text = errorSearchText(err);
  return REF_NOT_FOUND_PATTERNS.some(p => text.includes(p));
}

/** Does the error indicate a ref I/O failure? */
function isRefIoError(err: GitError): boolean {
  if (getExitCode(err) !== 128) {
    return false;
  }
  const text = errorSearchText(err);
  return REF_IO_PATTERNS.some(p => text.includes(p));
}

// ---------------------------------------------------------------------------
// Error wrapping
// ---------------------------------------------------------------------------

interface GitErrorHint {
  readonly ref?: string;
  readonly oid?: string;
}

/**
 * Wraps a raw Git error in a typed PersistenceError when the failure
 * matches a known pattern. Returns the original error unchanged otherwise.
 */
export function wrapGitError(err: GitError, hint: GitErrorHint = {}): GitError | PersistenceError {
  if (isMissingObjectError(err)) {
    return new PersistenceError(
      (hint.oid !== undefined && hint.oid.length > 0) ? `Missing Git object: ${hint.oid}` : err.message,
      PersistenceError.E_MISSING_OBJECT,
      { cause: err, context: { ...hint } },
    );
  }
  if (isRefNotFoundError(err)) {
    return new PersistenceError(
      (hint.ref !== undefined && hint.ref.length > 0) ? `Ref not found: ${hint.ref}` : err.message,
      PersistenceError.E_REF_NOT_FOUND,
      { cause: err, context: { ...hint } },
    );
  }
  if (isRefIoError(err)) {
    return new PersistenceError(
      (hint.ref !== undefined && hint.ref.length > 0) ? `Ref I/O error: ${hint.ref}` : err.message,
      PersistenceError.E_REF_IO,
      { cause: err, context: { ...hint } },
    );
  }
  return err;
}

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

/** Default retry options for git operations. Exponential backoff with jitter. */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  retries: 3,
  delay: 100,
  maxDelay: 2000,
  backoff: 'exponential',
  jitter: 'decorrelated',
  shouldRetry: isTransientError,
};

/**
 * Narrows a caught unknown to GitError for classification functions.
 * This is the single boundary parser for Git plumbing errors.
 */
export function toGitError(err: unknown): GitError {
  if (err instanceof Error) {
    return err as GitError;
  }
  // Adapter boundary: PersistenceError is the infrastructure representation of GitError
  return new PersistenceError(
    String(err),
    PersistenceError.E_MISSING_OBJECT,
    {},
  ) as unknown as GitError;
}
