import { retry, type RetryOptions } from '@git-stunts/alfred';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
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
