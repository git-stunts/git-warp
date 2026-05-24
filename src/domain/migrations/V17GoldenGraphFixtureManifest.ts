import { compareStrings } from '../utils/StringComparison.ts';
import WarpError from '../errors/WarpError.ts';

const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const PATH_SEGMENT_SEPARATOR = '/';

export const V17_GOLDEN_NODE_FACT = 'node';
export const V17_GOLDEN_EDGE_FACT = 'edge';
export const V17_GOLDEN_PROPERTY_FACT = 'property';
export const V17_GOLDEN_CONTENT_FACT = 'content';
export const V17_GOLDEN_REMOVAL_FACT = 'removal';
export const V17_GOLDEN_MULTI_WRITER_FACT = 'multi-writer';

export type V17GoldenGraphFixtureFactKind =
  | typeof V17_GOLDEN_NODE_FACT
  | typeof V17_GOLDEN_EDGE_FACT
  | typeof V17_GOLDEN_PROPERTY_FACT
  | typeof V17_GOLDEN_CONTENT_FACT
  | typeof V17_GOLDEN_REMOVAL_FACT
  | typeof V17_GOLDEN_MULTI_WRITER_FACT;

export type V17GoldenGraphFixtureWriterChainFields = {
  readonly writerId: string;
  readonly refName: string;
  readonly expectedHead: string;
  readonly patchCount: number;
};

export type V17GoldenGraphFixtureVisibleFactFields = {
  readonly kind: V17GoldenGraphFixtureFactKind;
  readonly key: string;
  readonly description: string;
};

export type V17GoldenGraphFixtureTypedFactFields = {
  readonly key: string;
  readonly description: string;
};

export type V17GoldenGraphFixtureManifestFields = {
  readonly fixtureId: string;
  readonly graphId: string;
  readonly sourceVersion: string;
  readonly generator: string;
  readonly bundlePath: string;
  readonly writerChains: readonly V17GoldenGraphFixtureWriterChain[];
  readonly visibleFacts: readonly V17GoldenGraphFixtureVisibleFact[];
};

/** Converts raw text into a supported v17 golden visible fact kind. */
export function v17GoldenGraphFixtureFactKindFromString(
  value: string,
): V17GoldenGraphFixtureFactKind {
  for (const kind of requiredFactKinds()) {
    if (value === kind) {
      return kind;
    }
  }
  throw new WarpError('visible fact kind is unsupported', 'E_VALIDATION');
}

/** Writer-chain expectation recorded by a v17 golden graph-history fixture. */
export class V17GoldenGraphFixtureWriterChain {
  readonly writerId: string;
  readonly refName: string;
  readonly expectedHead: string;
  readonly patchCount: number;

  constructor(fields: V17GoldenGraphFixtureWriterChainFields) {
    const checkedFields = requireWriterChainFields(fields);
    this.writerId = requireNonEmptyString(checkedFields.writerId, 'writerId');
    this.refName = requireWarpRef(checkedFields.refName);
    this.expectedHead = requireOid(checkedFields.expectedHead, 'expectedHead');
    this.patchCount = requirePositiveSafeInteger(checkedFields.patchCount, 'patchCount');
    Object.freeze(this);
  }
}

/** Operator-visible graph fact expectation for a restored v17 fixture. */
export class V17GoldenGraphFixtureVisibleFact {
  readonly kind: V17GoldenGraphFixtureFactKind;
  readonly key: string;
  readonly description: string;

  constructor(fields: V17GoldenGraphFixtureVisibleFactFields) {
    const checkedFields = requireVisibleFactFields(fields);
    this.kind = requireFactKind(checkedFields.kind);
    this.key = requireNonEmptyString(checkedFields.key, 'key');
    this.description = requireNonEmptyString(checkedFields.description, 'description');
    Object.freeze(this);
  }
}

/** Operator-visible node expectation for a restored v17 fixture. */
export class V17GoldenNodeFact extends V17GoldenGraphFixtureVisibleFact {
  constructor(fields: V17GoldenGraphFixtureTypedFactFields) {
    super({
      kind: V17_GOLDEN_NODE_FACT,
      key: fields.key,
      description: fields.description,
    });
  }
}

/** Operator-visible edge expectation for a restored v17 fixture. */
export class V17GoldenEdgeFact extends V17GoldenGraphFixtureVisibleFact {
  constructor(fields: V17GoldenGraphFixtureTypedFactFields) {
    super({
      kind: V17_GOLDEN_EDGE_FACT,
      key: fields.key,
      description: fields.description,
    });
  }
}

/** Operator-visible property expectation for a restored v17 fixture. */
export class V17GoldenPropertyFact extends V17GoldenGraphFixtureVisibleFact {
  constructor(fields: V17GoldenGraphFixtureTypedFactFields) {
    super({
      kind: V17_GOLDEN_PROPERTY_FACT,
      key: fields.key,
      description: fields.description,
    });
  }
}

/** Operator-visible content expectation for a restored v17 fixture. */
export class V17GoldenContentFact extends V17GoldenGraphFixtureVisibleFact {
  constructor(fields: V17GoldenGraphFixtureTypedFactFields) {
    super({
      kind: V17_GOLDEN_CONTENT_FACT,
      key: fields.key,
      description: fields.description,
    });
  }
}

/** Operator-visible removal expectation for a restored v17 fixture. */
export class V17GoldenRemovalFact extends V17GoldenGraphFixtureVisibleFact {
  constructor(fields: V17GoldenGraphFixtureTypedFactFields) {
    super({
      kind: V17_GOLDEN_REMOVAL_FACT,
      key: fields.key,
      description: fields.description,
    });
  }
}

/** Operator-visible multi-writer expectation for a restored v17 fixture. */
export class V17GoldenMultiWriterFact extends V17GoldenGraphFixtureVisibleFact {
  constructor(fields: V17GoldenGraphFixtureTypedFactFields) {
    super({
      kind: V17_GOLDEN_MULTI_WRITER_FACT,
      key: fields.key,
      description: fields.description,
    });
  }
}

/** Runtime-backed manifest for a restored v17 graph-history fixture. */
export default class V17GoldenGraphFixtureManifest {
  readonly fixtureId: string;
  readonly graphId: string;
  readonly sourceVersion: string;
  readonly generator: string;
  readonly bundlePath: string;
  readonly writerChains: readonly V17GoldenGraphFixtureWriterChain[];
  readonly visibleFacts: readonly V17GoldenGraphFixtureVisibleFact[];

  constructor(fields: V17GoldenGraphFixtureManifestFields) {
    const checkedFields = requireManifestFields(fields);
    this.fixtureId = requireNonEmptyString(checkedFields.fixtureId, 'fixtureId');
    this.graphId = requireNonEmptyString(checkedFields.graphId, 'graphId');
    this.sourceVersion = requireNonEmptyString(checkedFields.sourceVersion, 'sourceVersion');
    this.generator = requireNonEmptyString(checkedFields.generator, 'generator');
    this.bundlePath = requireRelativePath(checkedFields.bundlePath, 'bundlePath');
    this.writerChains = freezeWriterChains(checkedFields.writerChains);
    this.visibleFacts = freezeVisibleFacts(checkedFields.visibleFacts);
    Object.freeze(this);
  }

  /** Returns true when the fixture declares at least one visible fact kind. */
  hasVisibleFactKind(kind: V17GoldenGraphFixtureFactKind): boolean {
    const checkedKind = requireFactKind(kind);
    return this.visibleFacts.some((fact) => fact.kind === checkedKind);
  }
}

function requireManifestFields(
  fields: V17GoldenGraphFixtureManifestFields | null | undefined,
): V17GoldenGraphFixtureManifestFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('V17GoldenGraphFixtureManifest fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

function requireWriterChainFields(
  fields: V17GoldenGraphFixtureWriterChainFields | null | undefined,
): V17GoldenGraphFixtureWriterChainFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('V17GoldenGraphFixtureWriterChain fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

function requireVisibleFactFields(
  fields: V17GoldenGraphFixtureVisibleFactFields | null | undefined,
): V17GoldenGraphFixtureVisibleFactFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('V17GoldenGraphFixtureVisibleFact fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

function requireRelativePath(value: string, name: string): string {
  const checked = requireNonEmptyString(value, name);
  if (checked.startsWith(PATH_SEGMENT_SEPARATOR) || checked.split(PATH_SEGMENT_SEPARATOR).includes('..')) {
    throw new WarpError(`${name} must be a relative fixture path`, 'E_VALIDATION');
  }
  return checked;
}

function requireWarpRef(value: string): string {
  const checked = requireNonEmptyString(value, 'refName');
  if (!checked.startsWith('refs/warp/')) {
    throw new WarpError('refName must be under refs/warp/', 'E_VALIDATION');
  }
  return checked;
}

function requireOid(value: string, name: string): string {
  const checked = requireNonEmptyString(value, name);
  if (!OID_PATTERN.test(checked)) {
    throw new WarpError(`${name} must be a Git object id`, 'E_VALIDATION');
  }
  return checked;
}

function requirePositiveSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new WarpError(`${name} must be a positive safe integer`, 'E_VALIDATION');
  }
  return value;
}

function requireFactKind(kind: V17GoldenGraphFixtureFactKind): V17GoldenGraphFixtureFactKind {
  return v17GoldenGraphFixtureFactKindFromString(kind);
}

function freezeWriterChains(
  writerChains: readonly V17GoldenGraphFixtureWriterChain[],
): readonly V17GoldenGraphFixtureWriterChain[] {
  if (!Array.isArray(writerChains)) {
    throw new WarpError('writerChains must be an array', 'E_VALIDATION');
  }
  const checked = writerChains.map(requireWriterChain);
  requireUnique(checked.map((chain) => chain.writerId), 'writerId');
  requireUnique(checked.map((chain) => chain.refName), 'refName');
  return Object.freeze([...checked].sort(compareWriterChains));
}

function freezeVisibleFacts(
  visibleFacts: readonly V17GoldenGraphFixtureVisibleFact[],
): readonly V17GoldenGraphFixtureVisibleFact[] {
  if (!Array.isArray(visibleFacts)) {
    throw new WarpError('visibleFacts must be an array', 'E_VALIDATION');
  }
  const checked = visibleFacts.map(requireVisibleFact);
  requireVisibleFactCoverage(checked);
  requireUnique(checked.map((fact) => `${fact.kind}\0${fact.key}`), 'visible fact');
  return Object.freeze([...checked].sort(compareVisibleFacts));
}

function requireWriterChain(
  chain: V17GoldenGraphFixtureWriterChain,
): V17GoldenGraphFixtureWriterChain {
  if (!(chain instanceof V17GoldenGraphFixtureWriterChain)) {
    throw new WarpError('writerChains must contain V17GoldenGraphFixtureWriterChain values', 'E_VALIDATION');
  }
  return chain;
}

function requireVisibleFact(
  fact: V17GoldenGraphFixtureVisibleFact,
): V17GoldenGraphFixtureVisibleFact {
  if (!(fact instanceof V17GoldenGraphFixtureVisibleFact)) {
    throw new WarpError('visibleFacts must contain V17GoldenGraphFixtureVisibleFact values', 'E_VALIDATION');
  }
  return fact;
}

function requireUnique(keys: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new WarpError(`V17 golden graph fixture duplicates ${label} ${key}`, 'E_VALIDATION');
    }
    seen.add(key);
  }
}

function requireVisibleFactCoverage(facts: readonly V17GoldenGraphFixtureVisibleFact[]): void {
  const kinds = new Set(facts.map((fact) => fact.kind));
  for (const kind of requiredFactKinds()) {
    if (!kinds.has(kind)) {
      throw new WarpError(`visibleFacts must include ${kind}`, 'E_VALIDATION');
    }
  }
}

function requiredFactKinds(): readonly V17GoldenGraphFixtureFactKind[] {
  return Object.freeze([
    V17_GOLDEN_NODE_FACT,
    V17_GOLDEN_EDGE_FACT,
    V17_GOLDEN_PROPERTY_FACT,
    V17_GOLDEN_CONTENT_FACT,
    V17_GOLDEN_REMOVAL_FACT,
    V17_GOLDEN_MULTI_WRITER_FACT,
  ]);
}

function compareWriterChains(
  left: V17GoldenGraphFixtureWriterChain,
  right: V17GoldenGraphFixtureWriterChain,
): number {
  return compareStrings(left.refName, right.refName);
}

function compareVisibleFacts(
  left: V17GoldenGraphFixtureVisibleFact,
  right: V17GoldenGraphFixtureVisibleFact,
): number {
  return compareStrings(`${left.kind}\0${left.key}`, `${right.kind}\0${right.key}`);
}
