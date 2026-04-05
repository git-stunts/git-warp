/**
 * Runtime-validated capability extraction from persistence objects.
 *
 * Instead of casting persistence to port types (which lies about
 * what the value actually is at runtime), these helpers extract
 * exactly the methods each adapter needs and validate they exist.
 *
 * This is the honest boundary: the persistence object has the
 * methods, but it is NOT an instanceof any focused port class.
 * The extractors prove capability at the seam and return a
 * frozen object with bound methods.
 *
 * @module infrastructure/adapters/requireCapabilities
 */

/**
 * Thrown when persistence is missing a required method.
 */
export class MissingCapabilityError extends Error {
  /**
   * Creates a MissingCapabilityError for the named method.
   * @param {string} method - The missing method name
   */
  constructor(method) {
    super(`Persistence is missing required method: ${method}()`);
    this.name = 'MissingCapabilityError';
    /** @type {string} */
    this.method = method;
  }
}

/**
 * Validates that an object has a method of the given name.
 *
 * @param {unknown} obj
 * @param {string} name
 * @throws {MissingCapabilityError}
 */
function requireMethod(obj, name) {
  if (
    obj === null ||
    obj === undefined ||
    typeof (/** @type {Record<string, unknown>} */ (obj))[name] !== 'function'
  ) {
    throw new MissingCapabilityError(name);
  }
}

/**
 * Extracts blob read/write capability from a persistence object.
 *
 * @param {unknown} persistence
 * @returns {{ readBlob(oid: string): Promise<Uint8Array>, writeBlob(content: Uint8Array | string): Promise<string> }}
 */
export function requireBlobPort(persistence) {
  requireMethod(persistence, 'readBlob');
  requireMethod(persistence, 'writeBlob');
  const p = /** @type {{ readBlob(oid: string): Promise<Uint8Array>, writeBlob(content: Uint8Array | string): Promise<string> }} */ (persistence);
  return Object.freeze({
    readBlob: p.readBlob.bind(p),
    writeBlob: p.writeBlob.bind(p),
  });
}

/**
 * Extracts commit query capability from a persistence object.
 *
 * @param {unknown} persistence
 * @returns {{ getNodeInfo(sha: string): Promise<{sha: string, message: string, author: string, date: string, parents: string[]}> }}
 */
export function requireCommitPort(persistence) {
  requireMethod(persistence, 'getNodeInfo');
  const p = /** @type {{ getNodeInfo(sha: string): Promise<{sha: string, message: string, author: string, date: string, parents: string[]}> }} */ (persistence);
  return Object.freeze({
    getNodeInfo: p.getNodeInfo.bind(p),
  });
}

/**
 * Extracts tree read/write capability from a persistence object.
 *
 * @param {unknown} persistence
 * @returns {{ readTreeOids(treeOid: string): Promise<Record<string, string>>, writeTree(entries: string[]): Promise<string> }}
 */
export function requireTreePort(persistence) {
  requireMethod(persistence, 'readTreeOids');
  requireMethod(persistence, 'writeTree');
  const p = /** @type {{ readTreeOids(treeOid: string): Promise<Record<string, string>>, writeTree(entries: string[]): Promise<string> }} */ (persistence);
  return Object.freeze({
    readTreeOids: p.readTreeOids.bind(p),
    writeTree: p.writeTree.bind(p),
  });
}
