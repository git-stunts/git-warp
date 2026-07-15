import PersistenceError from '../../domain/errors/PersistenceError.ts';
import TreeEntryFound from '../../domain/tree/TreeEntryFound.ts';
import type TreeEntryLimit from '../../domain/tree/TreeEntryLimit.ts';
import TreeEntryMissing from '../../domain/tree/TreeEntryMissing.ts';
import TreeEntryPath from '../../domain/tree/TreeEntryPath.ts';
import TreeEntryPrefixBatch from '../../domain/tree/TreeEntryPrefixBatch.ts';
import type { TreeEntryProbeResult } from '../../domain/tree/TreeEntryProbeResult.ts';
import { validateOid } from './adapterValidation.ts';
import {
  type GitPlumbing,
  toGitError,
  wrapGitError,
} from './gitErrorClassification.ts';
import type OperationPolicyPort from '../../ports/OperationPolicyPort.ts';
import type { OperationPolicyExecuteOptions } from '../../ports/OperationPolicyPort.ts';

type GitRecursiveTreeOidReaderAdapterOptions = {
  readonly plumbing: GitPlumbing;
  readonly policy: OperationPolicyPort;
  readonly retryOptions: OperationPolicyExecuteOptions;
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

type PrefixParseContext = {
  readonly prefix: TreeEntryPath;
  readonly limit: TreeEntryLimit;
  readonly childPrefix: string;
};

const LS_TREE_RECORD_SEPARATOR = '\0';
const LS_TREE_METADATA_SEPARATOR = '\t';
const LS_TREE_METADATA_FIELD_COUNT = 3;
const TREE_OBJECT_TYPE = 'tree';
const TREE_PARSE_ERROR = 'E_TREE_PARSE_ERROR';
const GIT_OBJECT_ID_PATTERN = /^[0-9a-fA-F]{4,64}$/u;

export default class GitRecursiveTreeOidReaderAdapter {
  private readonly _plumbing: GitPlumbing;
  private readonly _policy: OperationPolicyPort;
  private readonly _retryOptions: OperationPolicyExecuteOptions;

  constructor(options: GitRecursiveTreeOidReaderAdapterOptions) {
    this._plumbing = options.plumbing;
    this._policy = options.policy;
    this._retryOptions = options.retryOptions;
  }

  async readTreeOids(treeOid: string): Promise<Record<string, string>> {
    validateOid(treeOid);
    try {
      const output = await this._policy.execute(
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
      const output = await this._policy.execute(
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
    const context = prefixParseContext(prefix, limit);
    try {
      const stream = await this._policy.stream(
        () => this._plumbing.executeStream({
          args: ['ls-tree', '-z', treeOid, '--', context.childPrefix],
        }),
        this._retryOptions,
      );
      return await parseTreeEntryPrefixStream(stream, context);
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { oid: treeOid });
    }
  }
}

function prefixParseContext(
  prefix: TreeEntryPath,
  limit: TreeEntryLimit,
): PrefixParseContext {
  return Object.freeze({
    prefix,
    limit,
    childPrefix: `${prefix.withoutTrailingSlash().value}/`,
  });
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

async function parseTreeEntryPrefixStream(
  source: AsyncIterable<Uint8Array>,
  context: PrefixParseContext,
): Promise<TreeEntryPrefixBatch> {
  const entries: TreeEntryFound[] = [];
  const decoder = new TextDecoder();
  let pending = '';

  for await (const chunk of source) {
    pending += decoder.decode(chunk, { stream: true });
    pending = consumeCompletePrefixRecords(pending, entries, context);
    if (entries.length >= context.limit.value) {
      return prefixBatch(context, entries);
    }
  }

  pending += decoder.decode();
  pending = consumeCompletePrefixRecords(pending, entries, context);
  if (entries.length < context.limit.value && pending.length > 0) {
    pushPrefixRecord(entries, pending, context.childPrefix);
  }

  return prefixBatch(context, entries);
}

function prefixBatch(
  context: PrefixParseContext,
  entries: readonly TreeEntryFound[],
): TreeEntryPrefixBatch {
  return new TreeEntryPrefixBatch({
    prefix: context.prefix,
    limit: context.limit,
    entries,
  });
}

function consumeCompletePrefixRecords(
  pending: string,
  entries: TreeEntryFound[],
  context: PrefixParseContext,
): string {
  let remainder = pending;
  let separator = remainder.indexOf(LS_TREE_RECORD_SEPARATOR);
  while (separator !== -1) {
    const record = remainder.slice(0, separator);
    remainder = remainder.slice(separator + LS_TREE_RECORD_SEPARATOR.length);
    pushPrefixRecord(entries, record, context.childPrefix);
    if (entries.length >= context.limit.value) {
      return remainder;
    }
    separator = remainder.indexOf(LS_TREE_RECORD_SEPARATOR);
  }
  return remainder;
}

function pushPrefixRecord(
  entries: TreeEntryFound[],
  record: string,
  childPrefix: string,
): void {
  if (record.length === 0) {
    return;
  }
  const entry = parseRecursiveTreeEntry(record);
  if (!entry.path.startsWith(childPrefix)) {
    throw malformedTreeEntry(record);
  }
  entries.push(new TreeEntryFound({
    path: new TreeEntryPath(entry.path),
    oid: entry.oid,
  }));
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
    oid: requireTreeOid(record, fields[2]),
  });
}

function requireTreeMetadataField(record: string, field: string | undefined): string {
  if (field === undefined || field.length === 0) {
    throw malformedTreeEntry(record);
  }
  return field;
}

function requireTreeOid(record: string, field: string | undefined): string {
  const oid = requireTreeMetadataField(record, field);
  if (!GIT_OBJECT_ID_PATTERN.test(oid)) {
    throw malformedTreeEntry(record);
  }
  return oid;
}

function malformedTreeEntry(record: string): PersistenceError {
  return new PersistenceError(
    `Malformed ls-tree entry: ${record}`,
    TREE_PARSE_ERROR,
    { context: { record } },
  );
}
