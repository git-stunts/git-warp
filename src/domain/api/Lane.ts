import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import Intent from './Intent.ts';
import Observation, { type ObservationExecution } from './Observation.ts';
import Observer from './Observer.ts';
import type { ReadingValue } from './ObservedReading.ts';
import type WriteReceipt from './WriteReceipt.ts';

export type LaneKind = 'worldline' | 'strand';

export type LaneReference = Readonly<{
  readonly kind: LaneKind;
  readonly name: string;
}>;

export type CoordinateReference = Readonly<{
  readonly id: string;
  readonly lane: LaneReference;
}>;

export type LaneDescriptor =
  | {
      readonly kind: 'worldline';
      readonly name: string;
    }
  | {
      readonly forkedAt: CoordinateReference;
      readonly kind: 'strand';
      readonly name: string;
      readonly parent: LaneReference;
    };

type WriteIntent = (intent: Intent) => Promise<WriteReceipt>;
type StartObserver = <TValue extends ReadingValue>(
  observer: Observer<TValue>,
) => ObservationExecution<TValue> | Promise<ObservationExecution<TValue>>;

type LaneOptions = {
  readonly descriptor: LaneDescriptor;
  readonly startObserver: StartObserver;
  readonly writeIntent: WriteIntent;
  readonly writer: string;
};

/** One admitted worldline or counterfactual strand owned by a Runtime. */
export default class Lane {
  readonly #descriptor: LaneDescriptor;
  readonly #startObserver: StartObserver;
  readonly #writeIntent: WriteIntent;
  readonly #writer: string;

  constructor(options: LaneOptions | null | undefined) {
    if (options === null || options === undefined) {
      throw new WarpError('Lane options are required', 'E_LANE_OPTIONS');
    }
    this.#descriptor = normalizeDescriptor(options.descriptor);
    requireNonEmptyString(options.writer, 'lane.writer');
    if (typeof options.startObserver !== 'function') {
      throw new WarpError('Lane requires an observer executor', 'E_LANE_OBSERVER');
    }
    if (typeof options.writeIntent !== 'function') {
      throw new WarpError('Lane requires an intent writer', 'E_LANE_WRITER');
    }
    this.#writer = options.writer;
    this.#startObserver = options.startObserver;
    this.#writeIntent = options.writeIntent;
    Object.freeze(this);
  }

  get descriptor(): LaneDescriptor {
    return this.#descriptor;
  }

  get kind(): LaneKind {
    return this.#descriptor.kind;
  }

  get name(): string {
    return this.#descriptor.name;
  }

  get reference(): LaneReference {
    return Object.freeze({ kind: this.kind, name: this.name });
  }

  get writer(): string {
    return this.#writer;
  }

  observe<TValue extends ReadingValue>(observer: Observer<TValue>): Observation<TValue> {
    if (!(observer instanceof Observer)) {
      throw new WarpError('Lane.observe requires an Observer', 'E_LANE_OBSERVE_OBSERVER');
    }
    return new Observation({
      observer,
      start: async () => await this.#startObserver(observer),
    });
  }

  async write(intent: Intent): Promise<WriteReceipt> {
    if (!(intent instanceof Intent)) {
      throw new WarpError('Lane.write requires an Intent', 'E_LANE_WRITE_INTENT');
    }
    return await this.#writeIntent(intent);
  }
}

function normalizeDescriptor(descriptor: LaneDescriptor): LaneDescriptor {
  if (typeof descriptor !== 'object' || descriptor === null) {
    throw new WarpError('Lane descriptor is required', 'E_LANE_DESCRIPTOR');
  }
  requireNonEmptyString(descriptor.name, 'lane.name');
  if (descriptor.kind === 'worldline') {
    return normalizeWorldlineDescriptor(descriptor);
  }
  if (descriptor.kind !== 'strand') {
    throw new WarpError('Lane kind is unsupported', 'E_LANE_KIND');
  }
  return normalizeStrandDescriptor(descriptor);
}

function normalizeWorldlineDescriptor(
  descriptor: Extract<LaneDescriptor, { readonly kind: 'worldline' }>,
): LaneDescriptor {
  if ('parent' in descriptor || 'forkedAt' in descriptor) {
    throw new WarpError(
      'Worldline Lane cannot carry strand coordinates',
      'E_LANE_KIND_OVERLAP',
    );
  }
  return Object.freeze({ kind: descriptor.kind, name: descriptor.name });
}

function normalizeStrandDescriptor(
  descriptor: Extract<LaneDescriptor, { readonly kind: 'strand' }>,
): LaneDescriptor {
  const parent = normalizeLaneReference(descriptor.parent, 'lane.parent');
  const forkedAt = normalizeCoordinateReference(descriptor.forkedAt);
  if (parent.kind !== forkedAt.lane.kind || parent.name !== forkedAt.lane.name) {
    throw new WarpError(
      'Strand fork coordinate must belong to its parent Lane',
      'E_LANE_FORK_PARENT',
    );
  }
  return Object.freeze({
    forkedAt,
    kind: descriptor.kind,
    name: descriptor.name,
    parent,
  });
}

function normalizeCoordinateReference(value: CoordinateReference): CoordinateReference {
  if (typeof value !== 'object' || value === null) {
    throw new WarpError('Strand Lane requires a fork coordinate', 'E_LANE_FORK_COORDINATE');
  }
  requireNonEmptyString(value.id, 'lane.forkedAt.id');
  return Object.freeze({
    id: value.id,
    lane: normalizeLaneReference(value.lane, 'lane.forkedAt.lane'),
  });
}

function normalizeLaneReference(value: LaneReference, field: string): LaneReference {
  if (typeof value !== 'object' || value === null) {
    throw new WarpError(`${field} is required`, 'E_LANE_REFERENCE');
  }
  requireNonEmptyString(value.name, `${field}.name`);
  if (value.kind !== 'worldline' && value.kind !== 'strand') {
    throw new WarpError(`${field}.kind is unsupported`, 'E_LANE_REFERENCE_KIND');
  }
  return Object.freeze({ kind: value.kind, name: value.name });
}
