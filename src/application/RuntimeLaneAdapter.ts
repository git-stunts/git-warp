import type ReadingResult from '../domain/api/ReadingResult.ts';
import type DraftTimeline from '../domain/api/DraftTimeline.ts';
import { createDraftReadingTarget } from '../domain/api/DraftTimelineRuntime.ts';
import type { DraftReadingTarget } from '../domain/api/DraftReadingTarget.ts';
import type Timeline from '../domain/api/Timeline.ts';
import type TimelineView from '../domain/api/TimelineView.ts';
import { requireTimelineRuntime } from '../domain/api/TimelineRuntime.ts';
import Lane from '../domain/api/Lane.ts';
import { bindLaneRuntime } from '../domain/api/LaneRuntime.ts';
import type { ObservationExecution } from '../domain/api/Observation.ts';
import type Observer from '../domain/api/Observer.ts';
import {
  decodeObserverValue,
  observerReadings,
} from '../domain/api/ObserverRuntime.ts';
import ObservationReceipt from '../domain/api/ObservationReceipt.ts';
import Reading, { type ReadingValue } from '../domain/api/ObservedReading.ts';
import type ReadReceipt from '../domain/api/ReadReceipt.ts';
import type Tick from '../domain/api/Tick.ts';
import WarpError from '../domain/errors/WarpError.ts';
import WarpStream from '../domain/stream/WarpStream.ts';
import type RuntimeActivity from './RuntimeActivity.ts';
import type { RuntimeActivityLease } from './RuntimeActivity.ts';
import RuntimeMutationGate from './RuntimeMutationGate.ts';
import { bindStrandLaneRuntime } from './RuntimeStrandLaneBinding.ts';
import {
  forkWorldlineLane,
  openWorldlineStrandLane,
  type StrandLaneOptions,
  type WorldlineLaneSource,
} from './RuntimeStrandLaneOpening.ts';

type ReceiptSettlement = Readonly<{
  promise: Promise<ObservationReceipt>;
  reject(reason: unknown): void;
  resolve(receipt: ObservationReceipt): void;
}>;
type ReadTarget = Pick<Timeline, 'read'> | Pick<TimelineView, 'read'>;
type ObservationLane = Readonly<{
  readonly name: string;
  readonly writer: string;
}>;
type ReadingStreamOutcome =
  | Readonly<{ kind: 'completed'; receipt: ReadReceipt | null }>
  | Readonly<{ kind: 'settled' }>;
type RuntimeLaneOptions = Readonly<{
  readonly mutations?: RuntimeMutationGate;
  readonly owner?: object;
}>;

export function createWorldlineLane(
  timeline: Timeline,
  activity: RuntimeActivity,
  options: RuntimeLaneOptions = {},
): Lane {
  const mutations = options.mutations ?? new RuntimeMutationGate();
  const owner = options.owner ?? Object.freeze({});
  const lane = new Lane({
    descriptor: { kind: 'worldline', name: timeline.name },
    writer: timeline.writer,
    writeIntent: async (intent) =>
      await activity.run(async () =>
        await mutations.run(async () => await timeline.write(intent))
      ),
    startObserver: <TValue extends ReadingValue>(observer: Observer<TValue>) =>
      startObserver(timeline, observer, activity),
  });
  const parent = worldlineParent(timeline.name);
  bindWorldlineLaneRuntime({
    activity,
    lane,
    mutations,
    owner,
    parent,
    timeline,
  });
  return lane;
}

function worldlineParent(name: string) {
  return Object.freeze({ kind: 'worldline' as const, name });
}

function bindWorldlineLaneRuntime(options: {
  readonly activity: RuntimeActivity;
  readonly lane: Lane;
  readonly mutations: RuntimeMutationGate;
  readonly owner: object;
  readonly parent: Readonly<{ readonly kind: 'worldline'; readonly name: string }>;
  readonly timeline: Timeline;
}): void {
  const source: WorldlineLaneSource = Object.freeze({
    activity: options.activity,
    mutations: options.mutations,
    owner: options.owner,
    parent: options.parent,
    timeline: options.timeline,
  });
  bindLaneRuntime(options.lane, {
    captureCoordinate: async () =>
      await captureWorldlineCoordinate(source.timeline, source.activity),
    fork: async (name) =>
      await forkWorldlineLane(source, name, createStrandLane),
    openStrand: async (name) =>
      await openWorldlineStrandLane(source, name, createStrandLane),
    owner: source.owner,
    settlement: Object.freeze({ kind: 'target' }),
  });
}

async function captureWorldlineCoordinate(
  timeline: Timeline,
  activity: RuntimeActivity,
) {
  return await activity.run(async () => {
    const runtime = requireTimelineRuntime(timeline);
    await runtime.prepareOpticBasis();
    return await runtime.coordinate();
  });
}

function createStrandLane(options: StrandLaneOptions): Lane {
  const { activity, draft, mutations } = options;
  const lane = new Lane({
    descriptor: {
      kind: 'strand',
      name: draft.name,
      parent: options.parent,
      forkedAt: options.forkedAt,
    },
    writer: draft.writer,
    writeIntent: async (intent) =>
      await activity.run(async () =>
        await mutations.run(async () => await draft.write(intent))
      ),
    startObserver: <TValue extends ReadingValue>(observer: Observer<TValue>) =>
      startStrandObserver(draft, observer, activity),
  });
  bindStrandLaneRuntime({
    activity,
    draft,
    lane,
    mutations,
    owner: options.owner,
  });
  return lane;
}

async function startObserver<TValue extends ReadingValue>(
  timeline: Timeline,
  observer: Observer<TValue>,
  activity: RuntimeActivity,
): Promise<ObservationExecution<TValue>> {
  const lease = activity.acquire();
  try {
    const hasBoundedBasis = await prepareBoundedBasis(timeline);
    const tick = hasBoundedBasis ? await timeline.tick() : null;
    const settlement = createReceiptSettlement();
    return Object.freeze({
      readings: WarpStream.from(streamReadings({
        lease,
        observer,
        settlement,
        tick,
        timeline,
        target: tick === null ? timeline : timeline.at(tick),
      })),
      receipt: settlement.promise,
    });
  } catch (error) {
    lease.release();
    throw error;
  }
}

async function startStrandObserver<TValue extends ReadingValue>(
  draft: DraftTimeline,
  observer: Observer<TValue>,
  activity: RuntimeActivity,
): Promise<ObservationExecution<TValue>> {
  const lease = activity.acquire();
  try {
    const target: DraftReadingTarget = await createDraftReadingTarget(draft);
    const settlement = createReceiptSettlement();
    return Object.freeze({
      readings: WarpStream.from(streamReadings({
        lease,
        observer,
        settlement,
        tick: target.tick,
        timeline: draft,
        target,
      })),
      receipt: settlement.promise,
    });
  } catch (error) {
    lease.release();
    throw error;
  }
}

async function prepareBoundedBasis(timeline: Timeline): Promise<boolean> {
  try {
    await requireTimelineRuntime(timeline).prepareOpticBasis();
    return true;
  } catch (error) {
    if (!(error instanceof WarpError) || error.code !== 'E_OPTIC_NO_BOUNDED_BASIS') {
      throw error;
    }
    // The bounded reader converts this operational condition into its Receipt.
    return false;
  }
}

async function* streamReadings<TValue extends ReadingValue>(options: {
  readonly lease: RuntimeActivityLease;
  readonly observer: Observer<TValue>;
  readonly settlement: ReceiptSettlement;
  readonly target: ReadTarget;
  readonly tick: Tick | null;
  readonly timeline: ObservationLane;
}): AsyncIterable<Reading<TValue>> {
  let completed = false;
  try {
    const outcome = yield* acceptedReadings(options);
    completeReadingStream(options, outcome);
    completed = true;
  } catch (error) {
    options.settlement.reject(error);
    completed = true;
    throw error;
  } finally {
    finishReadingStream(options, completed);
    options.lease.release();
  }
}

async function* acceptedReadings<TValue extends ReadingValue>(options: {
  readonly observer: Observer<TValue>;
  readonly settlement: ReceiptSettlement;
  readonly target: ReadTarget;
  readonly timeline: ObservationLane;
}): AsyncGenerator<Reading<TValue>, ReadingStreamOutcome> {
  let lastReceipt: ReadReceipt | null = null;
  for await (const plan of observerReadings(options.observer)) {
    const result = await options.target.read(plan);
    lastReceipt = result.receipt;
    const reading = readingFrom(options.timeline.name, options.observer, result);
    if (reading === null) {
      options.settlement.resolve(
        observationReceiptFrom(options.timeline, options.observer, result.receipt),
      );
      return Object.freeze({ kind: 'settled' });
    }
    yield reading;
  }
  return Object.freeze({ kind: 'completed', receipt: lastReceipt });
}

function completeReadingStream<TValue extends ReadingValue>(
  options: {
    readonly observer: Observer<TValue>;
    readonly settlement: ReceiptSettlement;
    readonly tick: Tick | null;
    readonly timeline: ObservationLane;
  },
  outcome: ReadingStreamOutcome,
): void {
  if (outcome.kind === 'settled') {
    return;
  }
  options.settlement.resolve(outcome.receipt === null
    ? emptyObservationReceipt(options.timeline, options.observer, options.tick)
    : observationReceiptFrom(options.timeline, options.observer, outcome.receipt));
}

function finishReadingStream<TValue extends ReadingValue>(
  options: {
    readonly observer: Observer<TValue>;
    readonly settlement: ReceiptSettlement;
    readonly tick: Tick | null;
    readonly timeline: ObservationLane;
  },
  completed: boolean,
): void {
  if (!completed) {
    options.settlement.resolve(
      cancelledObservationReceipt(options.timeline, options.observer, options.tick),
    );
  }
}

function createReceiptSettlement(): ReceiptSettlement {
  let rejectPromise: (reason: unknown) => void = () => undefined;
  let resolvePromise: (receipt: ObservationReceipt) => void = () => undefined;
  const promise = new Promise<ObservationReceipt>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });
  void promise.catch(() => undefined);
  return Object.freeze({
    promise,
    reject: rejectPromise,
    resolve: resolvePromise,
  });
}

function readingFrom<TValue extends ReadingValue>(
  lane: string,
  observer: Observer<TValue>,
  result: ReadingResult,
): Reading<TValue> | null {
  if (result.receipt.outcome !== 'accepted') {
    return null;
  }
  return new Reading<TValue>({
    evidence: requireEvidence(result.receipt),
    lane,
    value: decodeObserverValue(observer, result.value),
  });
}

function emptyObservationReceipt(
  timeline: ObservationLane,
  observer: Observer,
  tick: Tick | null,
): ObservationReceipt {
  if (tick === null) {
    return missingBasisObservationReceipt(timeline, observer);
  }
  return new ObservationReceipt({
    evidence: tickEvidence(tick),
    lane: timeline.name,
    observer,
    status: 'completed',
    writer: timeline.writer,
  });
}

function cancelledObservationReceipt(
  timeline: ObservationLane,
  observer: Observer,
  tick: Tick | null,
): ObservationReceipt {
  const fields = {
    lane: timeline.name,
    observer,
    reason: 'consumer_cancelled',
    status: 'obstructed',
    writer: timeline.writer,
  } as const;
  return new ObservationReceipt(
    tick === null ? fields : { ...fields, evidence: tickEvidence(tick) },
  );
}

function missingBasisObservationReceipt(
  timeline: ObservationLane,
  observer: Observer,
): ObservationReceipt {
  return new ObservationReceipt({
    lane: timeline.name,
    observer,
    reason: 'missing_bounded_basis',
    status: 'obstructed',
    writer: timeline.writer,
  });
}

function tickEvidence(tick: Tick): {
  readonly basis: Readonly<{ readonly id: string }>;
  readonly support: readonly Readonly<{ readonly id: string }>[];
  readonly tick: Tick;
} {
  return Object.freeze({
    basis: Object.freeze({ id: tick.id }),
    support: Object.freeze([]),
    tick,
  });
}

function observationReceiptFrom(
  timeline: ObservationLane,
  observer: Observer,
  receipt: ReadReceipt,
): ObservationReceipt {
  if (receipt.outcome === 'accepted') {
    return completedObservationReceipt(timeline, observer, receipt);
  }
  if (receipt.outcome === 'obstructed' || receipt.outcome === 'underdetermined') {
    return unresolvedObservationReceipt({
      observer,
      receipt,
      status: receipt.outcome,
      timeline,
    });
  }
  throw new WarpError(
    'Read runtime returned an invalid observation status',
    'E_OBSERVATION_STATUS_INVARIANT',
    { context: { outcome: receipt.outcome } },
  );
}

function completedObservationReceipt(
  timeline: ObservationLane,
  observer: Observer,
  receipt: ReadReceipt,
): ObservationReceipt {
  return new ObservationReceipt({
    evidence: requireEvidence(receipt),
    lane: timeline.name,
    observer,
    status: 'completed',
    writer: timeline.writer,
  });
}

function requireEvidence(
  receipt: ReadReceipt,
): NonNullable<ReadReceipt['evidence']> {
  if (receipt.evidence === undefined) {
    throw new WarpError(
      'Accepted observation is missing evidence',
      'E_OBSERVATION_EVIDENCE_INVARIANT',
    );
  }
  return receipt.evidence;
}

function unresolvedObservationReceipt(options: {
  readonly observer: Observer;
  readonly receipt: ReadReceipt;
  readonly status: 'obstructed' | 'underdetermined';
  readonly timeline: ObservationLane;
}): ObservationReceipt {
  const { observer, receipt, status, timeline } = options;
  const fields = {
    lane: timeline.name,
    observer,
    reason: receipt.reason ?? 'observation_unresolved',
    repairHints: receipt.repairHints,
    status,
    writer: timeline.writer,
  } as const;
  return new ObservationReceipt(
    receipt.evidence === undefined ? fields : { ...fields, evidence: receipt.evidence },
  );
}
