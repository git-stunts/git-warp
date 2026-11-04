import { describe, expect, it } from 'vitest';
import ObservationAttemptId from '../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../../../src/domain/services/custody/ObservationBudget.ts';
import ObservationDecodeFailure from '../../../../src/domain/services/custody/ObservationDecodeFailure.ts';
import ObservationDependencyClaim from '../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationEvidenceBinding from '../../../../src/domain/services/custody/ObservationEvidenceBinding.ts';
import ObservationPreparation from '../../../../src/domain/services/custody/ObservationPreparation.ts';
import ObservationPreparedPage from '../../../../src/domain/services/custody/ObservationPreparedPage.ts';
import ObservationPublicationEvidence from '../../../../src/domain/services/custody/ObservationPublicationEvidence.ts';
import ObservationQuestion from '../../../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationReceiptCore from '../../../../src/domain/services/custody/ObservationReceiptCore.ts';
import ObservationRecord from '../../../../src/domain/services/custody/ObservationRecord.ts';
import ObservationSettlementPage from '../../../../src/domain/services/custody/ObservationSettlementPage.ts';
import ObservationSupportSummary from '../../../../src/domain/services/custody/ObservationSupportSummary.ts';
import ObservationWritePremise from '../../../../src/domain/services/custody/ObservationWritePremise.ts';
import ObservationCustodyCborCodec from '../../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';

const custody = new ObservationCustodyCborCodec(codec);
const DIGEST = 'ab'.repeat(32);
const OTHER = 'cd'.repeat(32);
const COMMIT = '12'.repeat(20);

function bindings(overrides: Partial<ConstructorParameters<typeof ObservationBindings>[0]> = {}): ObservationBindings {
  return new ObservationBindings({
    basis: COMMIT,
    observer: 'people/alice',
    question: new ObservationQuestion('node-property', 1),
    purpose: 'todo/display',
    budget: new ObservationBudget({ records: 1, bytes: 2, work: 3 }),
    evidence: [new ObservationEvidenceBinding('law', new ObservationDigest(DIGEST))],
    dependencies: ObservationDependencyClaim.NONE,
    writePremise: null,
    ...overrides,
  });
}

function preparation(overrides: Parameters<typeof bindings>[0] = {}, attempt = '0'.repeat(32)): ObservationPreparation {
  return new ObservationPreparation(new ObservationAttemptId(attempt), bindings(overrides));
}

const PREMISE = new ObservationWritePremise({ intents: new ObservationDigest(DIGEST), writerId: 'w', predecessor: COMMIT });
const SUMMARY = new ObservationSupportSummary({
  writers: 2, history: new ObservationDigest(DIGEST), dependencies: 1, dependency: new ObservationDigest(OTHER), pages: [COMMIT],
});

describe('ObservationCustodyCborCodec', () => {
  it('round-trips each value to byte-identical canonical bytes', () => {
    for (const value of [preparation(), preparation({ writePremise: PREMISE })]) {
      const bytes = custody.encodePreparation(value);
      expect(custody.decodePreparation(bytes)).toBeInstanceOf(ObservationPreparation);
      expect(Uint8Array.from(custody.encodePreparation(new ObservationPreparation(value.attemptId, value.bindings)))).toEqual(Uint8Array.from(bytes));
    }
    const core = new ObservationReceiptCore({ family: 'write', variant: 'retained', outcome: Uint8Array.of(1, 2) });
    const coreBytes = custody.encodeCore(core);
    const decodedCore = custody.decodeCore(coreBytes);
    expect(decodedCore).toBeInstanceOf(ObservationReceiptCore);
    expect(Uint8Array.from(custody.encodeCore(decodedCore instanceof ObservationReceiptCore ? decodedCore : core))).toEqual(Uint8Array.from(coreBytes));
    for (const publication of [null, new ObservationPublicationEvidence('w', COMMIT)]) {
      const record = new ObservationRecord({ preparation: new ObservationDigest(DIGEST), support: new ObservationDigest(DIGEST), core: new ObservationDigest(OTHER), publication });
      expect(custody.decodeRecord(custody.encodeRecord(record))).toEqual(record);
    }
    const prepared = custody.decodePreparedPage(custody.encodePreparedPage(new ObservationPreparedPage(Uint8Array.of(9), SUMMARY)));
    expect(prepared).toBeInstanceOf(ObservationPreparedPage);
    const settled = custody.decodeSettlementPage(custody.encodeSettlementPage(new ObservationSettlementPage(Uint8Array.of(1), Uint8Array.of(2))));
    expect(settled).toBeInstanceOf(ObservationSettlementPage);
  });

  it('encodes independently of field insertion order and evidence content', () => {
    const left = custody.encodePreparation(preparation());
    expect(Uint8Array.from(custody.encodePreparation(preparation()))).toEqual(Uint8Array.from(left));
    expect(custody.encodePreparation(preparation({ observer: 'people/bob' }))).not.toEqual(left);
    expect(custody.encodePreparation(preparation({ purpose: 'other' }))).not.toEqual(left);
    expect(custody.encodePreparation(preparation({ question: new ObservationQuestion('node-property', 2) }))).not.toEqual(left);
    expect(custody.encodePreparation(preparation({ budget: new ObservationBudget({ records: 1, bytes: 2, work: 4 }) }))).not.toEqual(left);
    expect(custody.encodePreparation(preparation({ evidence: [] }))).not.toEqual(left);
    expect(custody.encodePreparation(preparation({ dependencies: new ObservationDependencyClaim(1, new ObservationDigest(DIGEST)) }))).not.toEqual(left);
    expect(custody.encodePreparation(preparation({ writePremise: PREMISE }))).not.toEqual(left);
    expect(custody.encodePreparation(preparation({}, '1'.repeat(32)))).not.toEqual(left);
  });

  it('owns its bytes: mutating an input or output leaves later encodings unchanged', () => {
    const outcome = Uint8Array.of(1, 2, 3);
    const core = new ObservationReceiptCore({ family: 'observation', variant: 'completed', outcome });
    const before = custody.encodeCore(core);
    outcome[0] = 9;
    core.outcome()[1] = 9;
    expect(Uint8Array.from(custody.encodeCore(core))).toEqual(Uint8Array.from(before));
    const page = new ObservationSettlementPage(Uint8Array.of(1), Uint8Array.of(2));
    page.record()[0] = 9;
    page.core()[0] = 9;
    expect(page.record()).toEqual(Uint8Array.of(1));
    expect(page.core()).toEqual(Uint8Array.of(2));
  });

  it('keeps the two preparation-derived identities distinct from the core', () => {
    const core = new ObservationReceiptCore({ family: 'observation', variant: 'completed', outcome: Uint8Array.of(1) });
    const other = new ObservationReceiptCore({ family: 'observation', variant: 'completed', outcome: Uint8Array.of(2) });
    expect(custody.encodeCore(core)).not.toEqual(custody.encodeCore(other));
    expect(custody.encodeCore(core)).not.toEqual(custody.encodePreparation(preparation()));
  });

  describe('adversarial bytes', () => {
    const core = (fields: WireMap): Uint8Array => codec.encode({
      domain: 'git-warp/observation-receipt-core', version: 1, family: 'write', outcome: Uint8Array.of(1), variant: 'retained', ...fields,
    });

    it('accepts the control and refuses unsupported versions and foreign domains', () => {
      expect(custody.decodeCore(core({}))).toBeInstanceOf(ObservationReceiptCore);
      expect(custody.decodeCore(core({ version: 2 }))).toBeInstanceOf(ObservationDecodeFailure);
      expect(custody.decodeCore(core({ domain: 'git-warp/observation-record' }))).toBeInstanceOf(ObservationDecodeFailure);
    });

    it('refuses surplus fields, including a Coordinate inside the core', () => {
      expect(custody.decodeCore(core({ coordinate: 'warp-observation:1:x' }))).toBeInstanceOf(ObservationDecodeFailure);
    });

    it('refuses garbage and truncation without throwing', () => {
      const valid = core({});
      expect(custody.decodeCore(Uint8Array.of(0xff, 0x00))).toBeInstanceOf(ObservationDecodeFailure);
      expect(custody.decodeCore(valid.subarray(0, valid.length - 2))).toBeInstanceOf(ObservationDecodeFailure);
      expect(custody.decodeCore(new Uint8Array())).toBeInstanceOf(ObservationDecodeFailure);
    });

    it('refuses alternate encodings of an otherwise valid value', () => {
      const valid = custody.encodeCore(new ObservationReceiptCore({ family: 'write', variant: 'retained', outcome: Uint8Array.of(1) }));
      expect(custody.decodeCore(valid)).toBeInstanceOf(ObservationReceiptCore);
      expect(custody.decodeCore(unsortedMap(valid))).toBeInstanceOf(ObservationDecodeFailure);
      expect(custody.decodeCore(withWideVersion(valid))).toBeInstanceOf(ObservationDecodeFailure);
    });

    it('refuses invalid domain values inside well-formed wire shapes', () => {
      const record = codec.encode({
        domain: 'git-warp/observation-record', version: 1, core: 'not-a-digest', preparation: DIGEST, publication: null, support: DIGEST,
      });
      expect(custody.decodeRecord(record)).toBeInstanceOf(ObservationDecodeFailure);
      const page = codec.encode({ domain: 'git-warp/observation-settlement-page', version: 1, core: 'text', record: Uint8Array.of(1) });
      expect(custody.decodeSettlementPage(page)).toBeInstanceOf(ObservationDecodeFailure);
      const prepared = codec.encode({
        domain: 'git-warp/observation-prepared-page', version: 1, dependencies: -1, dependency: DIGEST, history: DIGEST, pages: [], preparation: Uint8Array.of(1), writers: 0,
      });
      expect(custody.decodePreparedPage(prepared)).toBeInstanceOf(ObservationDecodeFailure);
      expect(custody.decodePreparation(codec.encode({ domain: 'git-warp/observation-preparation', version: 1 }))).toBeInstanceOf(ObservationDecodeFailure);
    });
  });
});

/** A value on the custody wire. */
type WireValue = string | number | null | Uint8Array | readonly WireValue[] | WireMap;
type WireMap = { readonly [field: string]: WireValue };

/** The same map with its first two entries swapped: same content, not canonical order. */
function unsortedMap(valid: Uint8Array): Uint8Array {
  return handEncodedMap([...sortedEntries(valid)].reverse());
}

/** The same value with its small version integer in a wider, non-minimal form. */
function withWideVersion(valid: Uint8Array): Uint8Array {
  return handEncodedMap(sortedEntries(valid), { wideVersion: true });
}

function sortedEntries(valid: Uint8Array): readonly (readonly [string, WireValue])[] {
  return Object.entries(codec.decode<WireMap>(valid)).sort(([left], [right]) => left.localeCompare(right));
}

function handEncodedMap(
  entries: readonly (readonly [string, WireValue])[],
  options: { readonly wideVersion?: boolean } = {},
): Uint8Array {
  const parts: number[] = [0xa0 + entries.length];
  for (const [key, value] of entries) {
    parts.push(...encodeText(key));
    if (key === 'version' && options.wideVersion === true) {
      parts.push(0x18, 0x01);
    } else {
      parts.push(...codec.encode(value));
    }
  }
  return Uint8Array.from(parts);
}

function encodeText(text: string): number[] {
  return [...codec.encode(text)];
}
