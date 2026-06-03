import { retry, type RetryOptions } from '@git-stunts/alfred';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import TreeEntryFound from '../../domain/tree/TreeEntryFound.ts';
import type TreeEntryLimit from '../../domain/tree/TreeEntryLimit.ts';
import TreeEntryMissing from '../../domain/tree/TreeEntryMissing.ts';
import TreeEntryPath from '../../domain/tree/TreeEntryPath.ts';
import TreeEntryPrefixBatch from '../../domain/tree/TreeEntryPrefixBatch.ts';
import type { TreeEntryProbeResult } from '../../ports/TreeEntryProbePort.ts';
import { validateOid } from './adapterValidation.ts';
import {
  type GitPlumbing,
  toGitError,
  wrapGitError,
} from './gitErrorClassification.ts';

type GitRecursiveTreeOidReaderAdapterOptions = {
  readonly plumbing: GitPlumbing;
  readonly retryOptions: RetryOptions;
};

type RecursiveTreeEntry = {
  readonly objectType: string;
  readonly oid: string;
  readonly path: string;
};

type RecursiveTreeMetadata = {
  readonly objectType: string;
  readonly oid: string;
};

const LS_TREE_RECORD_SEPARATOR = '\0';
const LS_TREE_METADATA_SEPARATOR = '\t';
const LS_TREE_METADATA_FIELD_COUNT = 3;
const TREE_OBJECT_TYPE = 'tree';
const TREE_PARSE_ERROR = 'E_TREE_PARSE_ERROR';

export default class GitRecursiveTreeOidReaderAdapter {
  private readonly _plumbing: GitPlumbing;
  private readonly _retryOptions: RetryOptions;

  constructor(options: GitRecursiveTreeOidReaderAdapterOptions) {
    this._plumbing = options.plumbing;
    this._retryOptions = options.retryOptions;
  }

  async readTreeOids(treeOid: string): Promise<Record<string, string>> {
    validateOid(treeOid);
    try {
      const output = await retry(
        () => this._plumbing.execute({ args: ['ls-tree', '-rz', treeOid] }),
        this._retryOptions,
      );
      return parseRecursiveTreeOidOutput(output);
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { oid: treeOid });
    }
  }

  async readTreeEntryOid(treeOid: string, path: TreeEntryPath): Promise<TreeEntryProbeResult> {
    validateOid(treeOid);
    try {
      const output = await retry(
        () => this._plumbing.execute({
          args: ['ls-tree', '-z', treeOid, '--', path.value],
        }),
        this._retryOptions,
      );
      return parseTreeEntryProbeOutput(output, path);
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { oid: treeOid });
    }
  }

  async readTreeEntryPrefix(
    treeOid: string,
    prefix: TreeEntryPath,
    limit: TreeEntryLimit,
  ): Promise<TreeEntryPrefixBatch> {
    validateOid(treeOid);
    const normalizedPrefix = prefix.withoutTrailingSlash();
    try {
      const output = await retry(
        () => this._plumbing.execute({
          args: ['ls-tree', '-z', treeOid, '--', normalizedPrefix.value],
        }),
        this._retryOptions,
      );
      return parseTreeEntryPrefixOutput(output, prefix, limit);
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { oid: treeOid });
    }
  }
}

function parseRecursiveTreeOidOutput(output: string): Record<string, string> {
  const oids = new Map<string, string>();
  for (const record of output.split(LS_TREE_RECORD_SEPARATOR)) {
    if (record.length === 0) {
      continue;
    }
    const entry = parseRecursiveTreeEntry(record);
    if (entry.objectType !== TREE_OBJECT_TYPE) {
      oids.set(entry.path, entry.oid);
    }
  }
  return Object.fromEntries(oids);
}

function parseTreeEntryProbeOutput(
  output: string,
  requestedPath: TreeEntryPath,
): TreeEntryProbeResult {
  const entries = parseTreeEntryOutput(output);
  if (entries.length === 0) {
    return new TreeEntryMissing(requestedPath);
  }
  if (entries.length > 1) {
    throw malformedTreeEntry(output);
  }
  const entry = entries[0];
  if (entry === undefined) {
    return new TreeEntryMissing(requestedPath);
  }
  return new TreeEntryFound({
    path: new TreeEntryPath(entry.path),
    oid: entry.oid,
  });
}

function parseTreeEntryPrefixOutput(
  output: string,
  prefix: TreeEntryPath,
  limit: TreeEntryLimit,
): TreeEntryPrefixBatch {
  const entries: TreeEntryFound[] = [];
  for (const record of treeEntryRecords(output)) {
    if (record.length === 0) {
      continue;
    }
    const entry = parseRecursiveTreeEntry(record);
    entries.push(new TreeEntryFound({
      path: new TreeEntryPath(entry.path),
      oid: entry.oid,
    }));
    if (entries.length >= limit.value) {
      break;
    }
  }
  return new TreeEntryPrefixBatch({ prefix, limit, entries });
}

function parseTreeEntryOutput(output: string): RecursiveTreeEntry[] {
  const entries: RecursiveTreeEntry[] = [];
  for (const record of treeEntryRecords(output)) {
    if (record.length === 0) {
      continue;
    }
    entries.push(parseRecursiveTreeEntry(record));
  }
  return entries;
}

function* treeEntryRecords(output: string): Generator<string> {
  let start = 0;
  while (start <= output.length) {
    const separator = output.indexOf(LS_TREE_RECORD_SEPARATOR, start);
    if (separator === -1) {
      yield output.slice(start);
      return;
    }
    yield output.slice(start, separator);
    start = separator + LS_TREE_RECORD_SEPARATOR.length;
  }
}

function parseRecursiveTreeEntry(record: string): RecursiveTreeEntry {
  const tabIndex = record.indexOf(LS_TREE_METADATA_SEPARATOR);
  if (tabIndex === -1) {
    throw malformedTreeEntry(record);
  }

  const metadata = record.slice(0, tabIndex);
  const parsedMetadata = parseRecursiveTreeMetadata(record, metadata);
  const path = record.slice(tabIndex + 1);
  if (path.length === 0) {
    throw malformedTreeEntry(record);
  }

  return Object.freeze({
    objectType: parsedMetadata.objectType,
    oid: parsedMetadata.oid,
    path,
  });
}

function parseRecursiveTreeMetadata(record: string, metadata: string): RecursiveTreeMetadata {
  const fields = metadata.split(' ');
  if (fields.length !== LS_TREE_METADATA_FIELD_COUNT) {
    throw malformedTreeEntry(record);
  }
  requireTreeMetadataField(record, fields[0]);
  return Object.freeze({
    objectType: requireTreeMetadataField(record, fields[1]),
    oid: requireTreeMetadataField(record, fields[2]),
  });
}

function requireTreeMetadataField(record: string, field: string | undefined): string {
  if (field === undefined || field.length === 0) {
    throw malformedTreeEntry(record);
  }
  return field;
}

function malformedTreeEntry(record: string): PersistenceError {
  return new PersistenceError(
    `Malformed ls-tree entry: ${record}`,
    TREE_PARSE_ERROR,
    { context: { record } },
  );
}
