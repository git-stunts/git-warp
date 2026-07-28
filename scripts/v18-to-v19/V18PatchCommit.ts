import { TrailerCodec, TrailerCodecService } from '@git-stunts/trailer-codec';

import { runV18MigrationGit } from './V18MigrationGit.ts';
import type { V18MigrationGitObjectReader } from './V18MigrationGitObjectReader.ts';

const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const codec = new TrailerCodec({ service: new TrailerCodecService() });

export type V18CommitIdentity = Readonly<{
  email: string;
  name: string;
  timestamp: string;
  timezone: string;
}>;

export type V18GitCommit = Readonly<{
  author: V18CommitIdentity;
  committer: V18CommitIdentity;
  message: string;
  parents: readonly string[];
  sha: string;
  tree: string;
}>;

export type V18PatchStorage =
  | Readonly<{ kind: 'current'; handle: string; encrypted: boolean }>
  | Readonly<{ kind: 'v18-git-cas'; oid: string; encrypted: boolean }>
  | Readonly<{ kind: 'legacy-blob'; oid: string; encrypted: false }>;

export type V18PatchCommit = Readonly<{
  commit: V18GitCommit;
  graph: string;
  lamport: number;
  schema: number;
  storage: V18PatchStorage;
  writer: string;
}>;

/** Reads and validates one linear patch commit from a v18 writer chain. */
export async function readV18PatchCommit(
  repositoryPath: string,
  sha: string,
  objectReader?: V18MigrationGitObjectReader,
): Promise<V18PatchCommit> {
  const bytes = objectReader === undefined
    ? await runV18MigrationGit(repositoryPath, ['cat-file', 'commit', sha])
    : await objectReader.readObject(sha, 'commit');
  const raw = Buffer.from(bytes).toString('utf8');
  const commit = parseGitCommit(sha, raw);
  return parsePatchMessage(commit);
}

function parseGitCommit(sha: string, raw: string): V18GitCommit {
  const separator = raw.indexOf('\n\n');
  if (separator < 0) {
    throw new Error(`commit ${sha} has no message separator`);
  }
  const headers = raw.slice(0, separator).split('\n');
  if (headers.some((header) => header.startsWith(' '))) {
    throw new Error(`commit ${sha} has unsupported continuation headers`);
  }
  const values = new Map<string, string[]>();
  for (const header of headers) {
    const space = header.indexOf(' ');
    if (space <= 0) {
      throw new Error(`commit ${sha} has a malformed header`);
    }
    const name = header.slice(0, space);
    const entries = values.get(name) ?? [];
    entries.push(header.slice(space + 1));
    values.set(name, entries);
  }
  requireOnlyHeaders(sha, values);
  const parents = values.get('parent') ?? [];
  if (parents.length > 1) {
    throw new Error(`writer commit ${sha} is a merge commit`);
  }
  return Object.freeze({
    author: parseIdentity(sha, 'author', requireSingle(values, 'author', sha)),
    committer: parseIdentity(sha, 'committer', requireSingle(values, 'committer', sha)),
    message: raw.slice(separator + 2),
    parents: Object.freeze([...parents]),
    sha,
    tree: requireOid(requireSingle(values, 'tree', sha), `commit ${sha} tree`),
  });
}

function parsePatchMessage(commit: V18GitCommit): V18PatchCommit {
  const decoded = codec.decode(commit.message);
  const trailers = decoded.trailers;
  if (trailers['eg-kind'] !== 'patch') {
    throw new Error(`writer commit ${commit.sha} is not a patch`);
  }
  const graph = requireTrailer(trailers, 'eg-graph', commit.sha);
  const writer = requireTrailer(trailers, 'eg-writer', commit.sha);
  const lamport = requirePositiveInteger(trailers, 'eg-lamport', commit.sha);
  const schema = requirePositiveInteger(trailers, 'eg-schema', commit.sha);
  return Object.freeze({
    commit,
    graph,
    lamport,
    schema,
    storage: parseStorage(trailers, commit.sha),
    writer,
  });
}

function parseStorage(trailers: Record<string, string>, sha: string): V18PatchStorage {
  const encrypted = parseEncrypted(trailers, sha);
  const handle = trailers['eg-patch-handle'];
  if (handle !== undefined) {
    if (
      trailers['eg-storage-version'] !== 'v19'
      || trailers['eg-storage-schema'] !== 'git-cas-asset-patch-v1'
    ) {
      throw new Error(`commit ${sha} has an unsupported patch handle route`);
    }
    return Object.freeze({ kind: 'current', handle, encrypted });
  }
  const oid = requireOid(requireTrailer(trailers, 'eg-patch-oid', sha), `commit ${sha} patch`);
  const version = trailers['eg-storage-version'];
  const schema = trailers['eg-storage-schema'];
  if (version === 'v17' && schema === 'git-cas-cbor-patch-v1') {
    return Object.freeze({ kind: 'v18-git-cas', oid, encrypted });
  }
  if (version === undefined && schema === undefined && !encrypted) {
    return Object.freeze({ kind: 'legacy-blob', oid, encrypted: false });
  }
  throw new Error(`commit ${sha} has an unsupported legacy patch storage route`);
}

function parseEncrypted(trailers: Record<string, string>, sha: string): boolean {
  const value = trailers['eg-encrypted'];
  if (value === undefined) {
    return false;
  }
  if (value !== 'true') {
    throw new Error(`commit ${sha} has an invalid eg-encrypted trailer`);
  }
  return true;
}

function parseIdentity(sha: string, label: string, value: string): V18CommitIdentity {
  const match = /^(.*) <([^<>]*)> ([0-9]+) ([+-][0-9]{4})$/u.exec(value);
  if (match === null) {
    throw new Error(`commit ${sha} has an unsupported ${label} identity`);
  }
  return Object.freeze({
    name: match[1] ?? '',
    email: match[2] ?? '',
    timestamp: match[3] ?? '',
    timezone: match[4] ?? '',
  });
}

function requireOnlyHeaders(sha: string, values: ReadonlyMap<string, readonly string[]>): void {
  for (const name of values.keys()) {
    if (!['tree', 'parent', 'author', 'committer'].includes(name)) {
      throw new Error(`commit ${sha} has unsupported header '${name}'`);
    }
  }
}

function requireSingle(
  values: ReadonlyMap<string, readonly string[]>,
  name: string,
  sha: string,
): string {
  const entries = values.get(name);
  if (entries?.length !== 1 || entries[0] === undefined) {
    throw new Error(`commit ${sha} requires exactly one ${name} header`);
  }
  return entries[0];
}

function requireTrailer(
  trailers: Record<string, string>,
  name: string,
  sha: string,
): string {
  const value = trailers[name];
  if (value === undefined || value === '') {
    throw new Error(`commit ${sha} is missing ${name}`);
  }
  return value;
}

function requirePositiveInteger(
  trailers: Record<string, string>,
  name: string,
  sha: string,
): number {
  const value = requireTrailer(trailers, name, sha);
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(`commit ${sha} has invalid ${name}`);
  }
  return Number(value);
}

function requireOid(value: string, label: string): string {
  if (!OID_PATTERN.test(value)) {
    throw new Error(`${label} is not a Git object ID`);
  }
  return value;
}
