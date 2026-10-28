import QueryError from '../../errors/QueryError.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import type ConeBasis from '../cone/ConeBasis.ts';
import type ConeRecordKey from '../cone/ConeRecordKey.ts';

export type ConeReadIdentityFrontierEntry = {
  readonly writerId: string;
  readonly patchSha: string;
  readonly lamport: number;
};

export type ConeReadIdentityOptions = {
  readonly worldline: string;
  readonly entityAspect: string;
  readonly basis: ConeBasis;
  readonly records: readonly ConeRecordKey[];
  readonly reducerVersion: string;
  readonly projectionVersion: string;
};

/**
 * What one cone-bounded Reading answered from (#1039): the cone basis (the
 * record trie root and the writer frontier it folds) and the records it
 * read. The root is content-addressed, so root plus record key names the
 * exact bytes the Reading saw.
 */
export default class ConeReadIdentity {
  readonly kind: 'cone-read' = 'cone-read';
  readonly basis: 'coneRecordBasis' = 'coneRecordBasis';
  readonly worldline: string;
  readonly entityAspect: string;
  readonly coneRoot: string;
  readonly coneFrontier: readonly ConeReadIdentityFrontierEntry[];
  readonly coneRecords: readonly string[];
  readonly reducerVersion: string;
  readonly projectionVersion: string;

  constructor(options: ConeReadIdentityOptions) {
    assertNonEmpty(options.worldline, 'worldline');
    assertNonEmpty(options.entityAspect, 'entityAspect');
    assertNonEmpty(options.reducerVersion, 'reducerVersion');
    assertNonEmpty(options.projectionVersion, 'projectionVersion');
    this.worldline = options.worldline;
    this.entityAspect = options.entityAspect;
    this.coneRoot = options.basis.root.toString();
    this.coneFrontier = frontierIdentity(options.basis);
    this.coneRecords = Object.freeze([...new Set(options.records.map((key) => key.toString()))].sort(compareStrings));
    this.reducerVersion = options.reducerVersion;
    this.projectionVersion = options.projectionVersion;
    Object.freeze(this);
  }
}

function frontierIdentity(basis: ConeBasis): readonly ConeReadIdentityFrontierEntry[] {
  return Object.freeze(basis.frontier.entries().map(([writerId, position]) => Object.freeze({
    writerId,
    patchSha: position.sha,
    lamport: position.lamport,
  })));
}

function assertNonEmpty(value: string, field: string): void {
  if (value.length === 0) {
    throw new QueryError('cone read identity requires non-empty fields', {
      code: 'E_OPTIC_READ_IDENTITY',
      context: { field },
    });
  }
}
