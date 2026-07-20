import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type Evidence from './Evidence.ts';
import type { EvidenceHandle } from './Evidence.ts';
import { freezeEvidence } from './EvidenceRuntime.ts';
import type { ReadingValue } from './ReadingValue.ts';
import { isReadingValue } from './ReadingValueRuntime.ts';
import type Tick from './LaneTick.ts';

export type { ReadingValue } from './ReadingValue.ts';
export type WitnessReference = Readonly<{
  readonly id: string;
}>;

export type ReadingCoordinate = Readonly<{
  readonly basis: EvidenceHandle;
  readonly lane: string;
  readonly tick?: Tick;
}>;

export type SupportReport = Readonly<{
  readonly evidence: readonly EvidenceHandle[];
  readonly status: 'supported';
}>;

type ReadingOptions<TValue extends ReadingValue> = {
  readonly evidence: Evidence;
  readonly lane: string;
  readonly value: TValue;
  readonly witnessRefs?: readonly WitnessReference[];
};

/** One bounded semantic value emitted by an Observation. */
export default class Reading<TValue extends ReadingValue = ReadingValue> {
  readonly coordinate: ReadingCoordinate;
  readonly support: SupportReport;
  readonly value: TValue;
  readonly witnessRefs: readonly WitnessReference[];

  constructor(options: ReadingOptions<TValue> | null | undefined) {
    if (options === null || options === undefined) {
      throw new WarpError('Reading options are required', 'E_READING_OPTIONS');
    }
    requireNonEmptyString(options.lane, 'reading.lane');
    if (!isReadingValue(options.value)) {
      throw new WarpError('Reading value must be snapshot-compatible data', 'E_READING_VALUE');
    }
    const evidence = freezeEvidence(options.evidence, 'reading.evidence');
    const support = Object.freeze([...evidence.support]);

    this.value = options.value;
    this.coordinate = createReadingCoordinate(evidence, options.lane);
    this.support = Object.freeze({ evidence: support, status: 'supported' });
    this.witnessRefs = freezeWitnessReferences(options.witnessRefs);
    Object.freeze(this);
  }
}

function createReadingCoordinate(evidence: Evidence, lane: string): ReadingCoordinate {
  if (evidence.tick === undefined) {
    return Object.freeze({ basis: evidence.basis, lane });
  }
  if (evidence.tick.timeline !== lane) {
    throw new WarpError(
      'Reading evidence tick must belong to its Lane',
      'E_READING_TICK_LANE',
    );
  }
  return Object.freeze({
    basis: evidence.basis,
    lane,
    tick: Object.freeze({ id: evidence.tick.id, lane }),
  });
}

function freezeWitnessReferences(
  references: readonly WitnessReference[] | undefined,
): readonly WitnessReference[] {
  if (references === undefined) {
    return Object.freeze([]);
  }
  const typedReferences: readonly WitnessReference[] = references;
  if (!Array.isArray(references)) {
    throw new WarpError('Reading witnessRefs must be an array', 'E_READING_WITNESS_REFS');
  }
  return Object.freeze(typedReferences.map((reference, index) => {
    if (typeof reference !== 'object' || reference === null) {
      throw new WarpError(
        'Reading witnessRef must be an object',
        'E_READING_WITNESS_REF',
      );
    }
    requireNonEmptyString(reference.id, `reading.witnessRefs[${index}].id`);
    return Object.freeze({ id: reference.id });
  }));
}
