import { describe, expect, it } from 'vitest';
import ObservationCustodyError from '../../../../../src/domain/errors/ObservationCustodyError.ts';
import ObservationAttempt from '../../../../../src/domain/services/custody/ObservationAttempt.ts';
import ObservationAttemptId from '../../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../../../../src/domain/services/custody/ObservationBudget.ts';
import ObservationCoordinate from '../../../../../src/domain/services/custody/ObservationCoordinate.ts';
import ObservationCustodyIdentity from '../../../../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationCustodyPage from '../../../../../src/domain/services/custody/ObservationCustodyPage.ts';
import ObservationCustodyRoots from '../../../../../src/domain/services/custody/ObservationCustodyRoots.ts';
import ObservationDependency from '../../../../../src/domain/services/custody/ObservationDependency.ts';
import ObservationDependencyClaim from '../../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationEvidenceBinding from '../../../../../src/domain/services/custody/ObservationEvidenceBinding.ts';
import ObservationPreparation from '../../../../../src/domain/services/custody/ObservationPreparation.ts';
import ObservationPreparedPage from '../../../../../src/domain/services/custody/ObservationPreparedPage.ts';
import ObservationPublicationEvidence from '../../../../../src/domain/services/custody/ObservationPublicationEvidence.ts';
import ObservationQuestion from '../../../../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationReceiptCore from '../../../../../src/domain/services/custody/ObservationReceiptCore.ts';
import ObservationRecord from '../../../../../src/domain/services/custody/ObservationRecord.ts';
import ObservationSettlementPage from '../../../../../src/domain/services/custody/ObservationSettlementPage.ts';
import ObservationSupportLimits from '../../../../../src/domain/services/custody/ObservationSupportLimits.ts';
import ObservationSupportSummary from '../../../../../src/domain/services/custody/ObservationSupportSummary.ts';
import ObservationWritePremise from '../../../../../src/domain/services/custody/ObservationWritePremise.ts';
import NodeCryptoAdapter from '../../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import ResolvedObservation from '../../../../../src/domain/services/custody/ResolvedObservation.ts';
import RetainedObservation from '../../../../../src/domain/services/custody/RetainedObservation.ts';

const HEX32 = '0'.repeat(32);
const DIGEST = 'ab'.repeat(32);
const OTHER = 'cd'.repeat(32);
const COMMIT = '12'.repeat(20);
const digest = new ObservationDigest(DIGEST);
const attemptId = new ObservationAttemptId(HEX32);
const question = new ObservationQuestion('q', 1);
const budget = new ObservationBudget({ records: 1, bytes: 1, work: 1 });

/** What a malformed-shape test hands a constructor, closed to the values these tests use. */
type ConstructorArgument = string | number | object | null;

function bindings(overrides: Readonly<Record<string, ConstructorArgument>> = {}): ObservationBindings {
  return Reflect.construct(ObservationBindings, [{
    basis: COMMIT, observer: 'o', question, purpose: 'p', budget, evidence: [], dependencies: ObservationDependencyClaim.NONE, writePremise: null, ...overrides,
  }]);
}

function limits(overrides: Partial<ConstructorParameters<typeof ObservationSupportLimits>[0]>): ObservationSupportLimits {
  return new ObservationSupportLimits({ writers: 0, dependencies: 0, frontierBytes: 0, work: 0, ...overrides });
}

function construct(type: new (...args: never[]) => object, ...args: readonly ConstructorArgument[]): object {
  return Reflect.construct(type, args);
}

describe('ObservationCoordinate text', () => {
  const canonical = `warp-observation:1:${HEX32}:${DIGEST}:${OTHER}`;

  it('round-trips only its exact canonical form', () => {
    const coordinate = ObservationCoordinate.parse(canonical);
    expect(coordinate?.toString()).toBe(canonical);
    expect(coordinate?.attemptId.value).toBe(HEX32);
    expect(coordinate?.binding.hex).toBe(DIGEST);
    expect(coordinate?.record.hex).toBe(OTHER);
  });

  it.each([
    ['empty', ''],
    ['unsupported version', canonical.replace(':1:', ':2:')],
    ['foreign domain', canonical.replace('warp-observation', 'warp-coordinate')],
    ['uppercase', canonical.toUpperCase()],
    ['leading space', ` ${canonical}`],
    ['trailing newline', `${canonical}\n`],
    ['surplus component', `${canonical}:00`],
    ['missing component', canonical.slice(0, canonical.lastIndexOf(':'))],
    ['short attempt', canonical.replace(HEX32, '0'.repeat(31))],
    ['short digest', canonical.replace(OTHER, 'cd'.repeat(31))],
    ['raw writer text', canonical.replace(OTHER, 'writer-1')],
    ['percent encoding', canonical.replace(':', '%3A')],
  ])('refuses %s', (_name, text) => {
    expect(ObservationCoordinate.parse(text)).toBeNull();
  });

  it('exposes only opaque digests and identifiers', () => {
    const coordinate = ObservationCoordinate.parse(canonical);
    expect(Object.keys(coordinate ?? {}).sort()).toEqual(['attemptId', 'binding', 'record']);
    expect(Object.isFrozen(coordinate)).toBe(true);
  });

  it('refuses a coordinate built from non-identifiers', () => {
    expect(() => construct(ObservationCoordinate, { attemptId: HEX32, binding: digest, record: digest })).toThrow(ObservationCustodyError);
    expect(() => construct(ObservationCoordinate, { attemptId, binding: DIGEST, record: digest })).toThrow(ObservationCustodyError);
    expect(() => construct(ObservationCoordinate, { attemptId, binding: digest, record: DIGEST })).toThrow(ObservationCustodyError);
  });
});

describe('ObservationDependencyClaim', () => {
  const crypto = new NodeCryptoAdapter();
  const left = new ObservationDependency('blob', COMMIT);
  const right = new ObservationDependency('tree', COMMIT);

  it('is order and content sensitive, and empty when nothing is declared', async () => {
    const forward = await ObservationDependencyClaim.of(crypto, [left, right]);
    expect(forward.count).toBe(2);
    expect(forward.equals(await ObservationDependencyClaim.of(crypto, [left, right]))).toBe(true);
    expect(forward.equals(await ObservationDependencyClaim.of(crypto, [right, left]))).toBe(false);
    expect(forward.equals(await ObservationDependencyClaim.of(crypto, [left]))).toBe(false);
    expect(await ObservationDependencyClaim.of(crypto, [])).toBe(ObservationDependencyClaim.NONE);
  });
});

describe('observation value invariants', () => {
  it.each([
    ['digest case', () => new ObservationDigest(DIGEST.toUpperCase())],
    ['digest length', () => new ObservationDigest('ab')],
    ['digest type', () => construct(ObservationDigest, 1)],
    ['attempt pattern', () => new ObservationAttemptId('xyz')],
    ['attempt type', () => construct(ObservationAttemptId, null)],
    ['question name', () => new ObservationQuestion('', 1)],
    ['question version', () => new ObservationQuestion('q', 0)],
    ['question fraction', () => new ObservationQuestion('q', 1.5)],
    ['budget zero', () => new ObservationBudget({ records: 0, bytes: 1, work: 1 })],
    ['budget infinity', () => new ObservationBudget({ records: 1, bytes: Infinity, work: 1 })],
    ['evidence kind', () => construct(ObservationEvidenceBinding, 'rumor', digest)],
    ['evidence digest', () => construct(ObservationEvidenceBinding, 'law', DIGEST)],
    ['premise intents', () => construct(ObservationWritePremise, { intents: DIGEST, writerId: 'w', predecessor: null })],
    ['premise writer', () => new ObservationWritePremise({ intents: digest, writerId: '', predecessor: null })],
    ['premise predecessor', () => new ObservationWritePremise({ intents: digest, writerId: 'w', predecessor: 'HEAD' })],
    ['bindings basis', () => bindings({ basis: 'main' })],
    ['bindings observer', () => bindings({ observer: '' })],
    ['bindings purpose', () => bindings({ purpose: 7 })],
    ['bindings question', () => bindings({ question: 'q' })],
    ['bindings budget', () => bindings({ budget: {} })],
    ['bindings evidence', () => bindings({ evidence: [DIGEST] })],
    ['bindings evidence list', () => bindings({ evidence: 'none' })],
    ['bindings premise', () => bindings({ writePremise: {} })],
    ['bindings dependencies', () => bindings({ dependencies: {} })],
    ['claim count', () => new ObservationDependencyClaim(-1, digest)],
    ['claim fraction', () => new ObservationDependencyClaim(0.5, digest)],
    ['claim digest', () => construct(ObservationDependencyClaim, 0, DIGEST)],
    ['preparation attempt', () => construct(ObservationPreparation, HEX32, bindings())],
    ['preparation bindings', () => construct(ObservationPreparation, attemptId, {})],
    ['core family', () => construct(ObservationReceiptCore, { family: 'other', variant: 'v', outcome: new Uint8Array() })],
    ['core variant', () => new ObservationReceiptCore({ family: 'write', variant: '', outcome: new Uint8Array() })],
    ['core outcome', () => construct(ObservationReceiptCore, { family: 'write', variant: 'v', outcome: 'text' })],
    ['publication writer', () => new ObservationPublicationEvidence('', COMMIT)],
    ['publication commit', () => new ObservationPublicationEvidence('w', 'HEAD')],
    ['record digest', () => construct(ObservationRecord, { preparation: DIGEST, support: digest, core: digest, publication: null })],
    ['record core', () => construct(ObservationRecord, { preparation: digest, support: digest, core: DIGEST, publication: null })],
    ['record support', () => construct(ObservationRecord, { preparation: digest, support: DIGEST, core: digest, publication: null })],
    ['record publication', () => construct(ObservationRecord, { preparation: digest, support: digest, core: digest, publication: {} })],
    ['identity attempt', () => construct(ObservationCustodyIdentity, HEX32, digest)],
    ['identity binding', () => construct(ObservationCustodyIdentity, attemptId, DIGEST)],
    ['roots support', () => new ObservationCustodyRoots([{ type: 'tree', oid: 'x' }], [])],
    ['roots parent', () => new ObservationCustodyRoots([], ['x'])],
    ['page bytes', () => construct(ObservationCustodyPage, 'text', new ObservationCustodyRoots([], []))],
    ['page roots', () => construct(ObservationCustodyPage, new Uint8Array(), {})],
    ['limits writers', () => limits({ writers: -1 })],
    ['limits dependencies', () => limits({ dependencies: 0.5 })],
    ['limits frontier', () => limits({ frontierBytes: -1 })],
    ['limits work', () => limits({ work: Infinity })],
    ['dependency type', () => construct(ObservationDependency, 'commit', COMMIT)],
    ['dependency oid', () => new ObservationDependency('blob', 'x')],
    ['summary count', () => new ObservationSupportSummary({ writers: -1, history: digest, dependencies: 0, dependency: digest, pages: [] })],
    ['summary dependencies', () => new ObservationSupportSummary({ writers: 0, history: digest, dependencies: -1, dependency: digest, pages: [] })],
    ['summary history', () => construct(ObservationSupportSummary, { writers: 0, history: DIGEST, dependencies: 0, dependency: digest, pages: [] })],
    ['summary dependency', () => construct(ObservationSupportSummary, { writers: 0, history: digest, dependencies: 0, dependency: DIGEST, pages: [] })],
    ['summary pages', () => new ObservationSupportSummary({ writers: 0, history: digest, dependencies: 0, dependency: digest, pages: ['x'] })],
    ['prepared bytes', () => construct(ObservationPreparedPage, 'text', {})],
    ['settlement record', () => construct(ObservationSettlementPage, 'text', new Uint8Array())],
    ['settlement core', () => construct(ObservationSettlementPage, new Uint8Array(), 'text')],
    ['attempt preparation', () => construct(ObservationAttempt, { preparation: {}, identity: {}, bytes: new Uint8Array() })],
    ['attempt mismatch', () => construct(ObservationAttempt, {
      preparation: new ObservationPreparation(attemptId, bindings()),
      identity: new ObservationCustodyIdentity(new ObservationAttemptId('1'.repeat(32)), digest),
      bytes: new Uint8Array(),
    })],
  ])('refuses invalid %s', (_name, build) => {
    expect(build).toThrow(ObservationCustodyError);
  });

  it('accepts valid values and freezes them', () => {
    const summary = new ObservationSupportSummary({ writers: 0, history: digest, dependencies: 0, dependency: digest, pages: [COMMIT] });
    const values = [
      digest, attemptId, question, budget, bindings(), summary,
      new ObservationCustodyRoots([{ type: 'blob', oid: COMMIT }], [COMMIT]),
      new ObservationDependency('tree', COMMIT),
      new ObservationPublicationEvidence('w', COMMIT),
      new ObservationWritePremise({ intents: digest, writerId: 'w', predecessor: COMMIT }),
    ];
    for (const value of values) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Object.isFrozen(bindings().evidence)).toBe(true);
    expect(Object.isFrozen(summary.pages)).toBe(true);
    expect(digest.equals(new ObservationDigest(DIGEST))).toBe(true);
    expect(digest.equals(new ObservationDigest(OTHER))).toBe(false);
  });

  it('copies bytes in and out of every byte owner', () => {
    const input = Uint8Array.of(1, 2);
    const identity = new ObservationCustodyIdentity(attemptId, digest);
    const preparation = new ObservationPreparation(attemptId, bindings());
    const record = new ObservationRecord({ preparation: digest, support: digest, core: digest, publication: null });
    const summary = new ObservationSupportSummary({ writers: 0, history: digest, dependencies: 0, dependency: digest, pages: [] });
    const coordinate = new ObservationCoordinate({ attemptId, binding: digest, record: digest });
    const readers: readonly (() => Uint8Array)[] = [
      ((owner) => () => owner.bytes())(new ObservationAttempt({ preparation, identity, bytes: input })),
      ((owner) => () => owner.record())(new ObservationCustodyPage(input, new ObservationCustodyRoots([], []))),
      ((owner) => () => owner.preparation())(new ObservationPreparedPage(input, summary)),
      ((owner) => () => owner.core())(new RetainedObservation(coordinate, input)),
      ((owner) => () => owner.core())(new ResolvedObservation({ preparation, record, core: input })),
    ];
    input[0] = 9;
    for (const read of readers) {
      read()[1] = 9;
      expect(read()).toEqual(Uint8Array.of(1, 2));
    }
  });
});
