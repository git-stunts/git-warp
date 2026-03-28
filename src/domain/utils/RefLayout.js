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
 * - refs/warp/<graph>/working-sets/<id>
 * - refs/warp/<graph>/working-set-overlays/<id>
 * - refs/warp/<graph>/working-set-braids/<id>/<support_id>
 * - refs/warp/<graph>/audit/<writer_id>
 * - refs/warp/<graph>/trust/records
 *
 * @module domain/utils/RefLayout
 */

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * The prefix for all warp refs.
 * @type {string}
 */
export const REF_PREFIX = 'refs/warp';

/**
 * Maximum length for a writer ID.
 * @type {number}
 */
export const MAX_WRITER_ID_LENGTH = 64;

/**
 * Regex pattern for valid writer IDs.
 * ASCII ref-safe characters: [A-Za-z0-9._-], 1-64 chars
 * @type {RegExp}
 */
const WRITER_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Pattern to detect path traversal sequences.
 * @type {RegExp}
 */
const PATH_TRAVERSAL_PATTERN = /\.\./;

/**
 * Ref-layout keywords that must not appear as any `/`-delimited segment
 * of a graph name. Using one of these would create an ambiguous ref path
 * (e.g. `refs/warp/writers/writers/alice`).
 *
 * @type {Set<string>}
 */
export const RESERVED_GRAPH_NAME_SEGMENTS = new Set([
  'writers',
  'checkpoints',
  'coverage',
  'cursor',
  'working-sets',
  'working-set-overlays',
  'working-set-braids',
  'audit',
  'trust',
  'seek-cache',
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
 * @param {string} name - The graph name to validate
 * @throws {Error} If the name is not a string, is empty, or contains
 *   forbidden characters (`..`, `;`, space, `\0`)
 * @returns {void}
 *
 * @example
 * validateGraphName('events');    // OK
 * validateGraphName('team/proj'); // OK (slashes allowed)
 * validateGraphName('../etc');    // throws — path traversal
 * validateGraphName('my graph');  // throws — contains space
 */
export function validateGraphName(name) {
  if (typeof name !== 'string') {
    throw new Error(`Invalid graph name: expected string, got ${typeof name}`);
  }

  if (name.length === 0) {
    throw new Error('Invalid graph name: cannot be empty');
  }

  if (PATH_TRAVERSAL_PATTERN.test(name)) {
    throw new Error(`Invalid graph name: contains path traversal sequence '..': ${name}`);
  }

  if (name.includes(';')) {
    throw new Error(`Invalid graph name: contains semicolon: ${name}`);
  }

  if (name.includes(' ')) {
    throw new Error(`Invalid graph name: contains space: ${name}`);
  }

  if (name.includes('\0')) {
    throw new Error(`Invalid graph name: contains null byte: ${name}`);
  }

  const segments = name.split('/');
  for (const seg of segments) {
    if (RESERVED_GRAPH_NAME_SEGMENTS.has(seg)) {
      throw new Error(
        `Invalid graph name: segment '${seg}' is a reserved ref-layout keyword: ${name}`
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
 * @param {string} id - The writer ID to validate
 * @throws {Error} If the ID is not a string, is empty, exceeds 64 characters,
 *   or contains forbidden characters (`/`, `..`, whitespace, NUL, non-ASCII)
 * @returns {void}
 *
 * @example
 * validateWriterId('node-1');        // OK
 * validateWriterId('a/b');           // throws — contains forward slash
 * validateWriterId('x'.repeat(65));  // throws — exceeds max length
 * validateWriterId('has space');     // throws — contains whitespace
 */
export function validateWriterId(id) {
  if (typeof id !== 'string') {
    throw new Error(`Invalid writer ID: expected string, got ${typeof id}`);
  }

  if (id.length === 0) {
    throw new Error('Invalid writer ID: cannot be empty');
  }

  if (id.length > MAX_WRITER_ID_LENGTH) {
    throw new Error(
      `Invalid writer ID: exceeds maximum length of ${MAX_WRITER_ID_LENGTH} characters: ${id.length}`
    );
  }

  // Check for path traversal before pattern check for clearer error message
  if (PATH_TRAVERSAL_PATTERN.test(id)) {
    throw new Error(`Invalid writer ID: contains path traversal sequence '..': ${id}`);
  }

  // Check for forward slash before pattern check for clearer error message
  if (id.includes('/')) {
    throw new Error(`Invalid writer ID: contains forward slash: ${id}`);
  }

  // Check for null byte
  if (id.includes('\0')) {
    throw new Error(`Invalid writer ID: contains null byte: ${id}`);
  }

  // Check for whitespace (space, tab, newline, etc.)
  if (/\s/.test(id)) {
    throw new Error(`Invalid writer ID: contains whitespace: ${id}`);
  }

  // Check overall pattern for ref-safe characters
  if (!WRITER_ID_PATTERN.test(id)) {
    throw new Error(`Invalid writer ID: contains invalid characters (only [A-Za-z0-9._-] allowed): ${id}`);
  }
}

// -----------------------------------------------------------------------------
// Builders
// -----------------------------------------------------------------------------

/**
 * Builds a writer ref path for the given graph and writer ID.
 *
 * @param {string} graphName - The name of the graph
 * @param {string} writerId - The writer's unique identifier
 * @returns {string} The full ref path, e.g. `refs/warp/<graphName>/writers/<writerId>`
 * @throws {Error} If graphName or writerId is invalid
 *
 * @example
 * buildWriterRef('events', 'node-1');
 * // => 'refs/warp/events/writers/node-1'
 */
export function buildWriterRef(graphName, writerId) {
  validateGraphName(graphName);
  validateWriterId(writerId);
  return `${REF_PREFIX}/${graphName}/writers/${writerId}`;
}

/**
 * Builds the checkpoint head ref path for the given graph.
 *
 * @param {string} graphName - The name of the graph
 * @returns {string} The full ref path, e.g. `refs/warp/<graphName>/checkpoints/head`
 * @throws {Error} If graphName is invalid
 *
 * @example
 * buildCheckpointRef('events');
 * // => 'refs/warp/events/checkpoints/head'
 */
export function buildCheckpointRef(graphName) {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/checkpoints/head`;
}

/**
 * Builds the coverage head ref path for the given graph.
 *
 * @param {string} graphName - The name of the graph
 * @returns {string} The full ref path, e.g. `refs/warp/<graphName>/coverage/head`
 * @throws {Error} If graphName is invalid
 *
 * @example
 * buildCoverageRef('events');
 * // => 'refs/warp/events/coverage/head'
 */
export function buildCoverageRef(graphName) {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/coverage/head`;
}

/**
 * Builds the writers prefix path for the given graph.
 * Useful for listing all writer refs under a graph
 * (e.g. via `git for-each-ref`).
 *
 * @param {string} graphName - The name of the graph
 * @returns {string} The writers prefix path (with trailing slash),
 *   e.g. `refs/warp/<graphName>/writers/`
 * @throws {Error} If graphName is invalid
 *
 * @example
 * buildWritersPrefix('events');
 * // => 'refs/warp/events/writers/'
 */
export function buildWritersPrefix(graphName) {
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
 * @param {string} graphName - The name of the graph
 * @returns {string} The full ref path, e.g. `refs/warp/<graphName>/cursor/active`
 * @throws {Error} If graphName is invalid
 *
 * @example
 * buildCursorActiveRef('events');
 * // => 'refs/warp/events/cursor/active'
 */
export function buildCursorActiveRef(graphName) {
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
 * @param {string} graphName - The name of the graph
 * @param {string} name - The cursor bookmark name (validated like a writer ID)
 * @returns {string} The full ref path, e.g. `refs/warp/<graphName>/cursor/saved/<name>`
 * @throws {Error} If graphName or name is invalid
 *
 * @example
 * buildCursorSavedRef('events', 'before-tui');
 * // => 'refs/warp/events/cursor/saved/before-tui'
 */
export function buildCursorSavedRef(graphName, name) {
  validateGraphName(graphName);
  validateWriterId(name);
  return `${REF_PREFIX}/${graphName}/cursor/saved/${name}`;
}

/**
 * Builds the saved cursor prefix path for the given graph.
 * Useful for listing all saved cursor bookmarks under a graph
 * (e.g. via `git for-each-ref`).
 *
 * @param {string} graphName - The name of the graph
 * @returns {string} The saved cursor prefix path (with trailing slash),
 *   e.g. `refs/warp/<graphName>/cursor/saved/`
 * @throws {Error} If graphName is invalid
 *
 * @example
 * buildCursorSavedPrefix('events');
 * // => 'refs/warp/events/cursor/saved/'
 */
export function buildCursorSavedPrefix(graphName) {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/cursor/saved/`;
}

/**
 * Builds a working-set descriptor ref path for the given graph and id.
 *
 * Working-set ids use the same ref-safe validation as writer ids because they
 * appear as the final ref path segment.
 *
 * @param {string} graphName
 * @param {string} workingSetId
 * @returns {string}
 */
export function buildWorkingSetRef(graphName, workingSetId) {
  validateGraphName(graphName);
  validateWriterId(workingSetId);
  return `${REF_PREFIX}/${graphName}/working-sets/${workingSetId}`;
}

/**
 * Builds the working-set prefix path for the given graph.
 *
 * @param {string} graphName
 * @returns {string}
 */
export function buildWorkingSetsPrefix(graphName) {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/working-sets/`;
}

/**
 * Builds a working-set overlay ref path for the given graph and id.
 *
 * Overlay refs keep the patch-log head for a working set separate from the
 * descriptor ref itself, allowing the descriptor to remain a single ref while
 * the overlay history advances independently.
 *
 * @param {string} graphName
 * @param {string} workingSetId
 * @returns {string}
 */
export function buildWorkingSetOverlayRef(graphName, workingSetId) {
  validateGraphName(graphName);
  validateWriterId(workingSetId);
  return `${REF_PREFIX}/${graphName}/working-set-overlays/${workingSetId}`;
}

/**
 * Public Strand-noun alias for the working-set overlay ref layout.
 *
 * @param {string} graphName
 * @param {string} strandId
 * @returns {string}
 */
export function buildStrandOverlayRef(graphName, strandId) {
  return buildWorkingSetOverlayRef(graphName, strandId);
}

/**
 * Builds the working-set overlay prefix path for the given graph.
 *
 * @param {string} graphName
 * @returns {string}
 */
export function buildWorkingSetOverlaysPrefix(graphName) {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/working-set-overlays/`;
}

/**
 * Builds a pinned braid ref for one support overlay inside a target working set.
 *
 * The ref points at the pinned head SHA for the support overlay at braid time,
 * keeping the support patch chain reachable even if the source working set is
 * later dropped or continues independently.
 *
 * @param {string} graphName
 * @param {string} workingSetId
 * @param {string} braidedWorkingSetId
 * @returns {string}
 */
export function buildWorkingSetBraidRef(graphName, workingSetId, braidedWorkingSetId) {
  validateGraphName(graphName);
  validateWriterId(workingSetId);
  validateWriterId(braidedWorkingSetId);
  return `${REF_PREFIX}/${graphName}/working-set-braids/${workingSetId}/${braidedWorkingSetId}`;
}

/**
 * Public Strand-noun alias for the working-set braid ref layout.
 *
 * @param {string} graphName
 * @param {string} strandId
 * @param {string} braidedStrandId
 * @returns {string}
 */
export function buildStrandBraidRef(graphName, strandId, braidedStrandId) {
  return buildWorkingSetBraidRef(graphName, strandId, braidedStrandId);
}

/**
 * Builds the braid-ref prefix path for all support overlays pinned inside one
 * target working set.
 *
 * @param {string} graphName
 * @param {string} workingSetId
 * @returns {string}
 */
export function buildWorkingSetBraidsPrefix(graphName, workingSetId) {
  validateGraphName(graphName);
  validateWriterId(workingSetId);
  return `${REF_PREFIX}/${graphName}/working-set-braids/${workingSetId}/`;
}

/**
 * Builds the audit ref path for the given graph and writer ID.
 *
 * Audit refs track the latest audit commit for each writer, forming
 * an independent chain of tamper-evident receipts per writer.
 *
 * @param {string} graphName - The name of the graph
 * @param {string} writerId - The writer's unique identifier
 * @returns {string} The full ref path, e.g. `refs/warp/<graphName>/audit/<writerId>`
 * @throws {Error} If graphName or writerId is invalid
 *
 * @example
 * buildAuditRef('events', 'alice');
 * // => 'refs/warp/events/audit/alice'
 */
export function buildAuditRef(graphName, writerId) {
  validateGraphName(graphName);
  validateWriterId(writerId);
  return `${REF_PREFIX}/${graphName}/audit/${writerId}`;
}

/**
 * Builds the audit ref prefix for listing all audit writers of a graph.
 *
 * @param {string} graphName - The name of the graph
 * @returns {string} The ref prefix, e.g. `refs/warp/<graphName>/audit/`
 * @throws {Error} If graphName is invalid
 *
 * @example
 * buildAuditPrefix('events');
 * // => 'refs/warp/events/audit/'
 */
export function buildAuditPrefix(graphName) {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/audit/`;
}

/**
 * Builds the seek cache ref path for the given graph.
 *
 * The seek cache ref points to a blob containing a JSON index of
 * cached materialization states, keyed by (ceiling, frontier) tuples.
 *
 * @param {string} graphName - The name of the graph
 * @returns {string} The full ref path, e.g. `refs/warp/<graphName>/seek-cache`
 * @throws {Error} If graphName is invalid
 *
 * @example
 * buildSeekCacheRef('events');
 * // => 'refs/warp/events/seek-cache'
 */
export function buildSeekCacheRef(graphName) {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/seek-cache`;
}

/**
 * Builds the trust record chain ref path for the given graph.
 *
 * The trust record ref points to the tip commit of the trust record
 * chain — an append-only sequence of signed trust records (key adds,
 * key revokes, writer bindings).
 *
 * @param {string} graphName - The name of the graph
 * @returns {string} The full ref path, e.g. `refs/warp/<graphName>/trust/records`
 * @throws {Error} If graphName is invalid
 *
 * @example
 * buildTrustRecordRef('events');
 * // => 'refs/warp/events/trust/records'
 */
export function buildTrustRecordRef(graphName) {
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
 * @param {string} refPath - The full ref path
 * @returns {string|null} The writer ID, or null if the path is not a valid writer ref
 *
 * @example
 * parseWriterIdFromRef('refs/warp/events/writers/alice');
 * // => 'alice'
 *
 * parseWriterIdFromRef('refs/heads/main');
 * // => null
 */
export function parseWriterIdFromRef(refPath) {
  if (typeof refPath !== 'string') {
    return null;
  }

  // Match pattern: refs/warp/<graph>/writers/<writerId>
  const prefix = `${REF_PREFIX}/`;
  if (!refPath.startsWith(prefix)) {
    return null;
  }

  const rest = refPath.slice(prefix.length);
  const parts = rest.split('/');

  // We expect: <graph>/writers/<writerId>
  // So parts should be: [graphName, 'writers', writerId]
  if (parts.length < 3) {
    return null;
  }

  // Find the 'writers' segment
  const writersIndex = parts.indexOf('writers');
  if (writersIndex === -1 || writersIndex === 0) {
    return null;
  }

  // The writer ID is everything after 'writers'
  // (should be exactly one segment for valid writer IDs)
  if (writersIndex !== parts.length - 2) {
    return null;
  }

  const writerId = parts[parts.length - 1];

  // Validate the extracted writer ID
  try {
    validateWriterId(writerId);
    return writerId;
  } catch {
    return null;
  }
}
