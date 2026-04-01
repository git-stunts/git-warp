/**
 * Shared trust test fixtures for TrustRecordService persistence and codecs.
 */

/**
 * Creates an in-memory persistence adapter with the exact ref/blob/tree/commit
 * surface used by TrustRecordService tests.
 *
 * The backing maps are exposed on the returned object so tests can simulate
 * concurrent ref movement or inspect stored objects directly.
 *
 * @returns {{
 *   refs: Map<string, string>,
 *   blobs: Map<string, Uint8Array|Buffer|string>,
 *   trees: Map<string, Record<string, string>>,
 *   commits: Map<string, { tree: string, parents: string[], message: string }>,
 *   readRef: (ref: string) => Promise<string|null>,
 *   compareAndSwapRef: (ref: string, newOid: string, expectedOid: string|null) => Promise<void>,
 *   writeBlob: (data: Uint8Array|Buffer|string) => Promise<string>,
 *   readBlob: (oid: string) => Promise<Uint8Array|Buffer|string>,
 *   writeTree: (entries: string[]) => Promise<string>,
 *   readTreeOids: (oid: string) => Promise<Record<string, string>>,
 *   getCommitTree: (sha: string) => Promise<string>,
 *   getNodeInfo: (sha: string) => Promise<{ parents: string[], message: string, date: null }>,
 *   commitNodeWithTree: (opts: { treeOid: string, parents?: string[], message: string }) => Promise<string>
 * }}
 */
export function createTrustRecordPersistence() {
  const refs = new Map();
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  let blobCounter = 0;
  let treeCounter = 0;
  let commitCounter = 0;

  return {
    refs,
    blobs,
    trees,
    commits,
    async readRef(ref) {
      return refs.get(ref) ?? null;
    },
    async compareAndSwapRef(ref, newOid, expectedOid) {
      const current = refs.get(ref) ?? null;
      if (current !== expectedOid) {
        throw new Error(`CAS failure: expected ${expectedOid}, found ${current}`);
      }
      refs.set(ref, newOid);
    },
    async writeBlob(data) {
      const oid = `blob-${++blobCounter}`;
      blobs.set(oid, data);
      return oid;
    },
    async readBlob(oid) {
      const data = blobs.get(oid);
      if (!data) {
        throw new Error(`Blob not found: ${oid}`);
      }
      return data;
    },
    async writeTree(entries) {
      const oid = `tree-${++treeCounter}`;
      /** @type {Record<string, string>} */
      const parsed = {};
      for (const line of entries) {
        const match = line.match(/^\d+ blob ([^\t]+)\t(.+)$/);
        if (match && match[2] && match[1]) {
          parsed[match[2]] = match[1];
        }
      }
      trees.set(oid, parsed);
      return oid;
    },
    async readTreeOids(oid) {
      const tree = trees.get(oid);
      if (!tree) {
        throw new Error(`Tree not found: ${oid}`);
      }
      return tree;
    },
    async getCommitTree(sha) {
      const commit = commits.get(sha);
      if (!commit) {
        throw new Error(`Commit not found: ${sha}`);
      }
      return commit.tree;
    },
    async getNodeInfo(sha) {
      const commit = commits.get(sha);
      if (!commit) {
        throw new Error(`Commit not found: ${sha}`);
      }
      return { parents: commit.parents, message: commit.message, date: null };
    },
    async commitNodeWithTree({ treeOid, parents = [], message }) {
      const oid = `commit-${++commitCounter}`;
      commits.set(oid, { tree: treeOid, parents, message });
      return oid;
    },
  };
}

/**
 * @returns {{ encode: (value: unknown) => Buffer, decode: (buf: Uint8Array|Buffer) => any }}
 */
export function createJsonCodec() {
  return {
    encode(value) {
      return Buffer.from(JSON.stringify(value));
    },
    decode(buf) {
      return JSON.parse(Buffer.from(buf).toString());
    },
  };
}
