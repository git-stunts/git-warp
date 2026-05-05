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

/** Thrown when persistence is missing a required method. */
export class MissingCapabilityError extends Error {
  readonly method: string;

  constructor(method: string) {
    super(`Persistence is missing required method: ${method}()`);
    this.name = 'MissingCapabilityError';
    this.method = method;
  }
}

function requireMethod(obj: unknown, name: string): void {
  if (
    obj === null ||
    obj === undefined ||
    typeof (obj as Record<string, unknown>)[name] !== 'function'
  ) {
    throw new MissingCapabilityError(name);
  }
}

/** Extracts blob read/write capability from a persistence object. */
export function requireBlobPort(persistence: unknown): { readBlob(oid: string): Promise<Uint8Array>; writeBlob(content: Uint8Array | string): Promise<string> } {
  requireMethod(persistence, 'readBlob');
  requireMethod(persistence, 'writeBlob');
  const p = persistence as { readBlob(oid: string): Promise<Uint8Array>; writeBlob(content: Uint8Array | string): Promise<string> };
  return Object.freeze({
    readBlob: p.readBlob.bind(p),
    writeBlob: p.writeBlob.bind(p),
  });
}

/** Extracts commit query capability from a persistence object. */
export function requireCommitPort(persistence: unknown): { getNodeInfo(sha: string): Promise<{ sha: string; message: string; author: string; date: string; parents: string[] }> } {
  requireMethod(persistence, 'getNodeInfo');
  const p = persistence as { getNodeInfo(sha: string): Promise<{ sha: string; message: string; author: string; date: string; parents: string[] }> };
  return Object.freeze({
    getNodeInfo: p.getNodeInfo.bind(p),
  });
}

/** Extracts tree read/write capability from a persistence object. */
export function requireTreePort(persistence: unknown): { readTreeOids(treeOid: string): Promise<Record<string, string>>; writeTree(entries: string[]): Promise<string> } {
  requireMethod(persistence, 'readTreeOids');
  requireMethod(persistence, 'writeTree');
  const p = persistence as { readTreeOids(treeOid: string): Promise<Record<string, string>>; writeTree(entries: string[]): Promise<string> };
  return Object.freeze({
    readTreeOids: p.readTreeOids.bind(p),
    writeTree: p.writeTree.bind(p),
  });
}
