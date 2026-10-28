import QueryError from '../../errors/QueryError.ts';
import { compareStrings } from '../../utils/StringComparison.ts';

export type ConeReadIdentityFrontierEntry = {
  readonly writerId: string;
  readonly patchSha: string;
  readonly lamport: number;
};

/**
 * The identity's fields in their published form. A witness is a public
 * noun, so its declaration names strings and plain frontier entries rather
 * than the internal cone basis and record-key classes they are rendered from.
 */
export type ConeReadIdentityOptions = {
  readonly worldline: string;
  readonly entityAspect: string;
  readonly coneRoot: string;
  readonly coneFrontier: readonly ConeReadIdentityFrontierEntry[];
  readonly coneRecords: readonly string[];
  readonly reducerVersion: string;
  readonly projectionVersion: string;
};

/**
 * What one cone-bounded Reading answered from (#1039): the cone basis (the
 * record trie root and the writer frontier it folds) and the records it
 * read. The root is content-addressed, so root plus record key names the
 * exact bytes the Reading saw. Record keys are kept once each, in order.
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
    assertNonEmpty(options.coneRoot, 'coneRoot');
    assertNonEmpty(options.reducerVersion, 'reducerVersion');
    assertNonEmpty(options.projectionVersion, 'projectionVersion');
    this.worldline = options.worldline;
    this.entityAspect = options.entityAspect;
    this.coneRoot = options.coneRoot;
    this.coneFrontier = Object.freeze(options.coneFrontier.map((entry) => Object.freeze({
      writerId: entry.writerId,
      patchSha: entry.patchSha,
      lamport: entry.lamport,
    })));
    this.coneRecords = Object.freeze([...new Set(options.coneRecords)].sort(compareStrings));
    this.reducerVersion = options.reducerVersion;
    this.projectionVersion = options.projectionVersion;
    Object.freeze(this);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.length === 0) {
    throw new QueryError('cone read identity requires non-empty fields', {
      code: 'E_OPTIC_READ_IDENTITY',
      context: { field },
    });
  }
}
