import { requireStrandId } from '../crdt/StrandId.ts';
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
 * - refs/warp/<graph>/cone/head
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
  'cone',
  'cursor',
  'strands',
  'audit',
  'trust',
  'intents',
  'seek-cache',
  'state-cache',
  'allocation',
  'migrations',
  'repairs',
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
 * Builds the cone basis head ref path for the given graph (#1039). Like the
 * checkpoint head it is derived, clone-local and never transferred.
 *
 * @example
 * buildConeHeadRef('events');
 * // => 'refs/warp/events/cone/head'
 */
export function buildConeHeadRef(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/cone/head`;
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
 * Builds a strand descriptor ref path (#1014):
 * `refs/warp/<graph>/strands/<strand-id>/descriptor`.
 *
 * Strand ids are immutable 64-hex genesis hashes, never friendly names.
 */
export function buildStrandRef(graphName: string, strandId: string): string {
  return `${buildStrandPrefix(graphName, strandId)}descriptor`;
}

/** Builds the strand prefix path for the given graph. */
export function buildStrandsPrefix(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/strands/`;
}

/** Builds the ref prefix holding everything that belongs to one strand. */
export function buildStrandPrefix(graphName: string, strandId: string): string {
  return `${buildStrandsPrefix(graphName)}${requireStrandId(strandId)}/`;
}

/** Builds the prefix of one strand's per-writer patch chains. */
export function buildStrandWritersPrefix(graphName: string, strandId: string): string {
  return `${buildStrandPrefix(graphName, strandId)}writers/`;
}

/**
 * Builds one writer's patch-chain ref on a strand. Each participant advances
 * only its own chain, so strand sync never non-fast-forwards a shared ref.
 */
export function buildStrandWriterRef(graphName: string, strandId: string, writerId: string): string {
  validateWriterId(writerId);
  return `${buildStrandWritersPrefix(graphName, strandId)}${writerId}`;
}

/** Builds an admitted or queued intent-journal ref. */
export function buildIntentRef(
  graphName: string,
  channel: 'admitted' | 'queued',
  ownerId: string,
): string {
  validateGraphName(graphName);
  validateWriterId(ownerId);
  return `${REF_PREFIX}/${graphName}/intents/${channel}/${ownerId}`;
}

/**
 * Builds a pinned braid ref for one writer chain of a support strand inside
 * a target strand. It keeps the pinned support chain reachable even if the
 * support strand is later dropped or continues independently.
 */
export function buildStrandBraidRef(
  graphName: string,
  strandId: string,
  pin: Readonly<{ braidedStrandId: string; writerId: string }>,
): string {
  validateWriterId(pin.writerId);
  return `${buildStrandBraidsPrefix(graphName, strandId)}${requireStrandId(pin.braidedStrandId)}/${pin.writerId}`;
}

/** Builds the braid-ref prefix for all support chains pinned inside one target strand. */
export function buildStrandBraidsPrefix(graphName: string, strandId: string): string {
  return `${buildStrandPrefix(graphName, strandId)}braids/`;
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
 * Builds the allocation floor ref for a writer (#1021).
 *
 * The ref points to a blob recording the highest dot counter the writer has
 * used on this clone. It is clone-local and never synced.
 *
 * @example
 * buildAllocationFloorRef('events', 'alice');
 * // => 'refs/warp/events/allocation/alice'
 */
export function buildAllocationFloorRef(graphName: string, writerId: string): string {
  validateGraphName(graphName);
  validateWriterId(writerId);
  return `${REF_PREFIX}/${graphName}/allocation/${writerId}`;
}

/**
 * Builds the ref of the worldline migration record for a graph (#1015). It
 * points to a blob recording the migration frontier, converted strands,
 * allocation provenance and reported damage.
 */
export function buildWorldlineMigrationRecordRef(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/migrations/worldline`;
}

/** Builds the prefix of a graph's duplicate-dot repair records (#1022). */
export function buildDotRepairsPrefix(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/repairs/`;
}

/** Builds the ref of one duplicate-dot repair record; ids are 64-hex digests. */
export function buildDotRepairRef(graphName: string, repairId: string): string {
  if (!/^[0-9a-f]{64}$/.test(repairId)) {
    throw new WarpError(`Invalid repair id: ${repairId}`, 'E_DOT_REPAIR_INVALID', { context: { repairId } });
  }
  return `${buildDotRepairsPrefix(graphName)}${repairId}`;
}

/**
 * Builds the exact retained-substrate version marker ref for a graph.
 */
export function buildSubstrateVersionRef(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/substrate-version`;
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
