import type ReadingResult from '../domain/api/ReadingResult.ts';
import type Timeline from '../domain/api/Timeline.ts';
import { requireTimelineRuntime } from '../domain/api/TimelineRuntime.ts';
import Lane from '../domain/api/Lane.ts';
import { bindLaneRuntime } from '../domain/api/LaneRuntime.ts';
import type { ObservationExecution } from '../domain/api/Observation.ts';
import type Observer from '../domain/api/Observer.ts';
import {
  decodeObserverValue,
  requireObserverReading,
} from '../domain/api/ObserverRuntime.ts';
import ObservationReceipt from '../domain/api/ObservationReceipt.ts';
import Reading, { type ReadingValue } from '../domain/api/ObservedReading.ts';
import type ReadReceipt from '../domain/api/ReadReceipt.ts';
import WarpError from '../domain/errors/WarpError.ts';
import WarpStream from '../domain/stream/WarpStream.ts';
import type RuntimeActivity from './RuntimeActivity.ts';

export function createWorldlineLane(
  timeline: Timeline,
  activity: RuntimeActivity,
): Lane {
  const lane = new Lane({
    descriptor: { kind: 'worldline', name: timeline.name },
    writer: timeline.writer,
    writeIntent: async (intent) => await activity.run(async () => await timeline.write(intent)),
    startObserver: <TValue extends ReadingValue>(observer: Observer<TValue>) =>
      startObserver(timeline, observer, activity),
  });
  bindLaneRuntime(lane, {
    captureCoordinate: async () => await activity.run(async () => {
      const runtime = requireTimelineRuntime(timeline);
      await runtime.prepareOpticBasis();
      return await runtime.coordinate();
    }),
  });
  return lane;
}

async function startObserver<TValue extends ReadingValue>(
  timeline: Timeline,
  observer: Observer<TValue>,
  activity: RuntimeActivity,
): Promise<ObservationExecution<TValue>> {
  return await activity.run(async () => {
    await prepareBoundedBasis(timeline);
    const result = await timeline.read(requireObserverReading(observer));
    const reading = readingFrom(timeline.name, observer, result);
    return Object.freeze({
      readings: reading === null
        ? WarpStream.from<Reading<TValue>>([])
        : WarpStream.of(reading),
      receipt: Promise.resolve(
        observationReceiptFrom(timeline, observer, result.receipt),
      ),
    });
  });
}

async function prepareBoundedBasis(timeline: Timeline): Promise<void> {
  try {
    await requireTimelineRuntime(timeline).prepareOpticBasis();
  } catch (error) {
    if (!(error instanceof WarpError) || error.code !== 'E_OPTIC_NO_BOUNDED_BASIS') {
      throw error;
    }
    // The bounded reader converts this operational condition into its Receipt.
  }
}

function readingFrom<TValue extends ReadingValue>(
  lane: string,
  observer: Observer<TValue>,
  result: ReadingResult,
): Reading<TValue> | null {
  if (result.receipt.outcome !== 'accepted') {
    return null;
  }
  if (result.receipt.evidence === undefined) {
    throw new WarpError(
      'Accepted observation is missing evidence',
      'E_OBSERVATION_EVIDENCE_INVARIANT',
    );
  }
  return new Reading<TValue>({
    evidence: result.receipt.evidence,
    lane,
    value: decodeObserverValue(observer, result.value),
  });
}

function observationReceiptFrom(
  timeline: Timeline,
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
  timeline: Timeline,
  observer: Observer,
  receipt: ReadReceipt,
): ObservationReceipt {
  if (receipt.evidence === undefined) {
    throw new WarpError(
      'Accepted observation is missing evidence',
      'E_OBSERVATION_EVIDENCE_INVARIANT',
    );
  }
  return new ObservationReceipt({
    evidence: receipt.evidence,
    lane: timeline.name,
    observer,
    status: 'completed',
    writer: timeline.writer,
  });
}

function unresolvedObservationReceipt(options: {
  readonly observer: Observer;
  readonly receipt: ReadReceipt;
  readonly status: 'obstructed' | 'underdetermined';
  readonly timeline: Timeline;
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
