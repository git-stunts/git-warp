import WarpError from '../errors/WarpError.ts';

/**
 * Ref layout constants and helpers for WARP (Write-Ahead Reference Protocol).
 *
 * Provides functions for building, parsing, and validating Git ref paths
 * used by the WARP protocol. All refs live under the refs/warp/ namespace.
 *
 * Ref layout:
 * - refs/warp/<graph>/writers/<writer_id>
 * - refs/warp/<graph>/checkpoints/head
 * - refs/warp/<graph>/coverage/head
 * - refs/warp/<graph>/cursor/active
 * - refs/warp/<graph>/cursor/saved/<name>
 * - refs/warp/<graph>/strands/<id>
 * - refs/warp/<graph>/strand-overlays/<id>
 * - refs/warp/<graph>/strand-braids/<id>/<support_id>
 * - refs/warp/<graph>/audit/<writer_id>
 * - refs/warp/<graph>/trust/records
 *
 * @module domain/utils/RefLayout
 */

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** The prefix for all warp refs. */
export const REF_PREFIX: string = 'refs/warp';

/** Maximum length for a writer ID. */
export const MAX_WRITER_ID_LENGTH: number = 64;

/**
 * Regex pattern for valid writer IDs.
 * ASCII ref-safe characters: [A-Za-z0-9._-], 1-64 chars
 */
const WRITER_ID_PATTERN: RegExp = /^[A-Za-z0-9._-]+$/;

/** Pattern to detect path traversal sequences. */
const PATH_TRAVERSAL_PATTERN: RegExp = /\.\./;

/**
 * Ref-layout keywords that must not appear as any `/`-delimited segment
 * of a graph name. Using one of these would create an ambiguous ref path
 * (e.g. `refs/warp/writers/writers/alice`).
 */
export const RESERVED_GRAPH_NAME_SEGMENTS: Set<string> = new Set([
  'writers',
  'checkpoints',
  'coverage',
  'cursor',
  'strands',
  'strand-overlays',
  'strand-braids',
  'audit',
  'trust',
  'seek-cache',
  'state-cache',
]);

// -----------------------------------------------------------------------------
// Validators
// -----------------------------------------------------------------------------

/**
 * Validates a graph name and throws if invalid.
 *
 * Graph names must not contain:
 * - Path traversal sequences (`..`)
 * - Semicolons (`;`)
 * - Spaces
 * - Null bytes (`\0`)
 * - Empty strings
 *
 * @throws {Error} If the name is not a string, is empty, or contains
 *   forbidden characters (`..`, `;`, space, `\0`)
 *
 * @example
 * validateGraphName('events');    // OK
 * validateGraphName('team/proj'); // OK (slashes allowed)
 * validateGraphName('../etc');    // throws — path traversal
 * validateGraphName('my graph');  // throws — contains space
 */
export function validateGraphName(name: string): void {
  if (typeof name !== 'string') {
    throw new WarpError(`Invalid graph name: expected string, got ${typeof name}`, 'E_INVALID_GRAPH_NAME');
  }
  if (name.length === 0) {
    throw new WarpError('Invalid graph name: cannot be empty', 'E_INVALID_GRAPH_NAME');
  }
  rejectForbiddenGraphChars(name);
  rejectReservedSegments(name);
}

/**
 * Throws if the graph name contains any forbidden character sequences.
 */
function rejectForbiddenGraphChars(name: string): void {
  if (PATH_TRAVERSAL_PATTERN.test(name)) {
    throw new WarpError(`Invalid graph name: contains path traversal sequence '..': ${name}`, 'E_INVALID_GRAPH_NAME');
  }
  if (name.includes(';')) {
    throw new WarpError(`Invalid graph name: contains semicolon: ${name}`, 'E_INVALID_GRAPH_NAME');
  }
  if (name.includes(' ')) {
    throw new WarpError(`Invalid graph name: contains space: ${name}`, 'E_INVALID_GRAPH_NAME');
  }
  if (name.includes('\0')) {
    throw new WarpError(`Invalid graph name: contains null byte: ${name}`, 'E_INVALID_GRAPH_NAME');
  }
}

/**
 * Throws if any slash-delimited segment of the name is a reserved ref-layout keyword.
 */
function rejectReservedSegments(name: string): void {
  const segments = name.split('/');
  for (const seg of segments) {
    if (RESERVED_GRAPH_NAME_SEGMENTS.has(seg)) {
      throw new WarpError(
        `Invalid graph name: segment '${seg}' is a reserved ref-layout keyword: ${name}`,
        'E_INVALID_GRAPH_NAME',
      );
    }
  }
}

/**
 * Validates a writer ID and throws if invalid.
 *
 * Writer IDs must:
 * - Be ASCII ref-safe: only `[A-Za-z0-9._-]`
 * - Be 1-64 characters long
 * - Not contain `/`, `..`, whitespace, or NUL
 *
 * @throws {Error} If the ID is not a string, is empty, exceeds 64 characters,
 *   or contains forbidden characters (`/`, `..`, whitespace, NUL, non-ASCII)
 *
 * @example
 * validateWriterId('node-1');        // OK
 * validateWriterId('a/b');           // throws — contains forward slash
 * validateWriterId('x'.repeat(65));  // throws — exceeds max length
 * validateWriterId('has space');     // throws — contains whitespace
 */
export function validateWriterId(id: string): void {
  if (typeof id !== 'string') {
    throw new WarpError(`Invalid writer ID: expected string, got ${typeof id}`, 'E_INVALID_WRITER_ID');
  }
  if (id.length === 0) {
    throw new WarpError('Invalid writer ID: cannot be empty', 'E_INVALID_WRITER_ID');
  }
  if (id.length > MAX_WRITER_ID_LENGTH) {
    throw new WarpError(
      `Invalid writer ID: exceeds maximum length of ${MAX_WRITER_ID_LENGTH} characters: ${id.length}`,
      'E_INVALID_WRITER_ID',
    );
  }
  rejectForbiddenWriterChars(id);
}

/**
 * Throws if the writer ID contains forbidden characters or fails the ref-safe pattern.
 */
function rejectForbiddenWriterChars(id: string): void {
  if (PATH_TRAVERSAL_PATTERN.test(id)) {
    throw new WarpError(`Invalid writer ID: contains path traversal sequence '..': ${id}`, 'E_INVALID_WRITER_ID');
  }
  if (id.includes('/')) {
    throw new WarpError(`Invalid writer ID: contains forward slash: ${id}`, 'E_INVALID_WRITER_ID');
  }
  rejectControlAndNonAscii(id);
}

/**
 * Throws if the writer ID contains null bytes, whitespace, or non-ASCII ref-unsafe chars.
 */
function rejectControlAndNonAscii(id: string): void {
  if (id.includes('\0')) {
    throw new WarpError(`Invalid writer ID: contains null byte: ${id}`, 'E_INVALID_WRITER_ID');
  }
  if (/\s/.test(id)) {
    throw new WarpError(`Invalid writer ID: contains whitespace: ${id}`, 'E_INVALID_WRITER_ID');
  }
  if (!WRITER_ID_PATTERN.test(id)) {
    throw new WarpError(`Invalid writer ID: contains invalid characters (only [A-Za-z0-9._-] allowed): ${id}`, 'E_INVALID_WRITER_ID');
  }
}

// -----------------------------------------------------------------------------
// Builders
// -----------------------------------------------------------------------------

/**
 * Builds a writer ref path for the given graph and writer ID.
 *
 * @example
 * buildWriterRef('events', 'node-1');
 * // => 'refs/warp/events/writers/node-1'
 */
export function buildWriterRef(graphName: string, writerId: string): string {
  validateGraphName(graphName);
  validateWriterId(writerId);
  return `${REF_PREFIX}/${graphName}/writers/${writerId}`;
}

/**
 * Builds the checkpoint head ref path for the given graph.
 *
 * @example
 * buildCheckpointRef('events');
 * // => 'refs/warp/events/checkpoints/head'
 */
export function buildCheckpointRef(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/checkpoints/head`;
}

/**
 * Builds the coverage head ref path for the given graph.
 *
 * @example
 * buildCoverageRef('events');
 * // => 'refs/warp/events/coverage/head'
 */
export function buildCoverageRef(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/coverage/head`;
}

/**
 * Builds the writers prefix path for the given graph.
 * Useful for listing all writer refs under a graph
 * (e.g. via `git for-each-ref`).
 *
 * @example
 * buildWritersPrefix('events');
 * // => 'refs/warp/events/writers/'
 */
export function buildWritersPrefix(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/writers/`;
}

/**
 * Builds the active cursor ref path for the given graph.
 *
 * The active cursor is a single ref that stores the current time-travel
 * position used by `git warp seek`. It points to a commit SHA representing
 * the materialization frontier the user has seeked to.
 *
 * @example
 * buildCursorActiveRef('events');
 * // => 'refs/warp/events/cursor/active'
 */
export function buildCursorActiveRef(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/cursor/active`;
}

/**
 * Builds a saved (named) cursor ref path for the given graph and cursor name.
 *
 * Saved cursors are bookmarks created by `git warp seek --save <name>`.
 * Each saved cursor persists a time-travel position that can be restored
 * later without re-seeking.
 *
 * The cursor name is validated with the same rules as a writer ID
 * (ASCII ref-safe: `[A-Za-z0-9._-]`, 1-64 characters).
 *
 * @example
 * buildCursorSavedRef('events', 'before-tui');
 * // => 'refs/warp/events/cursor/saved/before-tui'
 */
export function buildCursorSavedRef(graphName: string, name: string): string {
  validateGraphName(graphName);
  validateWriterId(name);
  return `${REF_PREFIX}/${graphName}/cursor/saved/${name}`;
}

/**
 * Builds the saved cursor prefix path for the given graph.
 * Useful for listing all saved cursor bookmarks under a graph
 * (e.g. via `git for-each-ref`).
 *
 * @example
 * buildCursorSavedPrefix('events');
 * // => 'refs/warp/events/cursor/saved/'
 */
export function buildCursorSavedPrefix(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/cursor/saved/`;
}

/**
 * Builds a strand descriptor ref path for the given graph and id.
 *
 * Strand ids use the same ref-safe validation as writer ids because they
 * appear as the final ref path segment.
 */
export function buildStrandRef(graphName: string, strandId: string): string {
  validateGraphName(graphName);
  validateWriterId(strandId);
  return `${REF_PREFIX}/${graphName}/strands/${strandId}`;
}

/** Builds the strand prefix path for the given graph. */
export function buildStrandsPrefix(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/strands/`;
}

/**
 * Builds a strand overlay ref path for the given graph and id.
 *
 * Overlay refs keep the patch-log head for a strand separate from the
 * descriptor ref itself, allowing the descriptor to remain a single ref while
 * the overlay history advances independently.
 */
export function buildStrandOverlayRef(graphName: string, strandId: string): string {
  validateGraphName(graphName);
  validateWriterId(strandId);
  return `${REF_PREFIX}/${graphName}/strand-overlays/${strandId}`;
}

/**
 * Builds a pinned braid ref for one support overlay inside a target strand.
 *
 * The ref points at the pinned head SHA for the support overlay at braid time,
 * keeping the support patch chain reachable even if the source strand is
 * later dropped or continues independently.
 */
export function buildStrandBraidRef(graphName: string, strandId: string, braidedStrandId: string): string {
  validateGraphName(graphName);
  validateWriterId(strandId);
  validateWriterId(braidedStrandId);
  return `${REF_PREFIX}/${graphName}/strand-braids/${strandId}/${braidedStrandId}`;
}

/**
 * Builds the braid-ref prefix path for all support overlays pinned inside one
 * target strand.
 */
export function buildStrandBraidsPrefix(graphName: string, strandId: string): string {
  validateGraphName(graphName);
  validateWriterId(strandId);
  return `${REF_PREFIX}/${graphName}/strand-braids/${strandId}/`;
}

/**
 * Builds the audit ref path for the given graph and writer ID.
 *
 * Audit refs track the latest audit commit for each writer, forming
 * an independent chain of tamper-evident receipts per writer.
 *
 * @example
 * buildAuditRef('events', 'alice');
 * // => 'refs/warp/events/audit/alice'
 */
export function buildAuditRef(graphName: string, writerId: string): string {
  validateGraphName(graphName);
  validateWriterId(writerId);
  return `${REF_PREFIX}/${graphName}/audit/${writerId}`;
}

/**
 * Builds the audit ref prefix for listing all audit writers of a graph.
 *
 * @example
 * buildAuditPrefix('events');
 * // => 'refs/warp/events/audit/'
 */
export function buildAuditPrefix(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/audit/`;
}

/**
 * Builds the seek cache ref path for the given graph.
 *
 * The seek cache ref points to a blob containing a JSON index of
 * cached materialization states, keyed by (ceiling, frontier) tuples.
 *
 * @example
 * buildSeekCacheRef('events');
 * // => 'refs/warp/events/seek-cache'
 */
export function buildSeekCacheRef(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/seek-cache`;
}

/**
 * Builds the state cache ref path for the given graph.
 *
 * The state cache ref points to a blob containing a JSON index of
 * cached durable CAS WarpState snapshots.
 *
 * @example
 * buildStateCacheRef('events');
 * // => 'refs/warp/events/state-cache'
 */
export function buildStateCacheRef(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/state-cache`;
}

/**
 * Builds the trust record chain ref path for the given graph.
 *
 * The trust record ref points to the tip commit of the trust record
 * chain — an append-only sequence of signed trust records (key adds,
 * key revokes, writer bindings).
 *
 * @example
 * buildTrustRecordRef('events');
 * // => 'refs/warp/events/trust/records'
 */
export function buildTrustRecordRef(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/trust/records`;
}

// -----------------------------------------------------------------------------
// Parsers
// -----------------------------------------------------------------------------

/**
 * Parses and extracts the writer ID from a writer ref path.
 *
 * Returns null for any non-writer ref, including malformed refs. Callers that
 * need to distinguish "not a writer ref" from "malformed ref" should validate
 * the ref format separately before calling this method.
 *
 * @example
 * parseWriterIdFromRef('refs/warp/events/writers/alice');
 * // => 'alice'
 *
 * parseWriterIdFromRef('refs/heads/main');
 * // => null
 */
export function parseWriterIdFromRef(refPath: string): string | null {
  if (typeof refPath !== 'string') {
    return null;
  }
  const parts = splitWarpRefParts(refPath);
  if (parts === null) {
    return null;
  }
  return extractValidWriterId(parts);
}

/**
 * Splits a ref path into its segment parts after stripping the warp prefix.
 * Returns null if the ref is not under refs/warp/ or has too few segments.
 */
function splitWarpRefParts(refPath: string): string[] | null {
  const prefix = `${REF_PREFIX}/`;
  if (!refPath.startsWith(prefix)) {
    return null;
  }
  const parts = refPath.slice(prefix.length).split('/');
  if (parts.length < 3) {
    return null;
  }
  return parts;
}

/**
 * Extracts and validates the writer ID from parsed ref parts.
 * Expects the pattern [...graphSegments, 'writers', writerId].
 */
function extractValidWriterId(parts: string[]): string | null {
  const writersIndex = parts.indexOf('writers');
  if (writersIndex < 1 || writersIndex !== parts.length - 2) {
    return null;
  }
  const writerId = parts[parts.length - 1];
  if (writerId === undefined) {
    return null;
  }
  try {
    validateWriterId(writerId);
    return writerId;
  } catch {
    return null;
  }
}
