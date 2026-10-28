import type Timeline from '../domain/api/Timeline.ts';
import {
  requireTimelineContext,
  requireTimelineRuntime,
} from '../domain/api/TimelineRuntime.ts';
import {
  createEntityAdmissionInventoryTick,
  requireEntityAdmissionInventoryBasis,
  retainEntityAdmissionInventoryTick,
} from '../domain/api/TickRuntime.ts';
import type Observer from '../domain/api/Observer.ts';
import type { ReadingValue } from '../domain/api/ReadingValue.ts';
import type { ObservationExecution } from '../domain/api/Observation.ts';
import Reading from '../domain/api/ObservedReading.ts';
import ObservationReceipt from '../domain/api/ObservationReceipt.ts';
import EntityAdmission from '../domain/api/EntityAdmission.ts';
import EntityAdmissionInventoryCertificate, {
  ENTITY_ADMISSION_INVENTORY_SCHEMA,
} from '../domain/api/EntityAdmissionInventoryCertificate.ts';
import {
  bindEntityAdmissionInventoryCertificate,
  bindEntityAdmissionInventoryContinuation,
} from '../domain/api/EntityAdmissionInventoryCertificateRuntime.ts';
import EntityAdmissionInventoryCursor from '../domain/api/EntityAdmissionInventoryCursor.ts';
import {
  requireEntityAdmissionInventoryPaging,
  type EntityAdmissionInventoryPaging,
} from '../domain/api/EntityAdmissionInventoryObserverRuntime.ts';
import { decodeObserverValue } from '../domain/api/ObserverRuntime.ts';
import {
  createEntityAdmissionInventoryCertificateEvidence,
  createEntityAdmissionInventoryEvidence,
} from '../domain/api/EvidenceRuntime.ts';
import { createEntityOccurrence } from '../domain/api/EntityOccurrenceRuntime.ts';
import type { ApiRuntimeContext } from '../domain/api/ApiRuntimeContext.ts';
import type Evidence from '../domain/api/Evidence.ts';
import type Tick from '../domain/api/Tick.ts';
import type RetainedEntityAdmission from '../domain/entity/RetainedEntityAdmission.ts';
import { openEntityAdmissions } from '../domain/entity/EntityAdmissionInventoryRuntime.ts';
import type ConeAdmissionMerge from '../domain/entity/ConeAdmissionMerge.ts';
import WarpError from '../domain/errors/WarpError.ts';
import WarpStream from '../domain/stream/WarpStream.ts';
import { canonicalStringify } from '../domain/utils/canonicalStringify.ts';
import type RuntimeActivity from './RuntimeActivity.ts';
import type { RuntimeActivityLease } from './RuntimeActivity.ts';

type ReceiptSettlement = Readonly<{
  promise: Promise<ObservationReceipt>;
  resolve(receipt: ObservationReceipt): void;
}>;

type InventoryState = {
  admissionCount: number;
  streamDigest: string;
};

type EmittedAdmission<TValue extends ReadingValue> = Readonly<{
  occurrenceId: string;
  reading: Reading<TValue>;
}>;

type InventoryOptions<TValue extends ReadingValue> = Readonly<{
  context: ApiRuntimeContext;
  lease: RuntimeActivityLease;
  observer: Observer<TValue>;
  paging: EntityAdmissionInventoryPaging;
  settlement: ReceiptSettlement;
  tick: Tick;
  timeline: Timeline;
}>;

type StateUpdateOptions = Readonly<{
  context: ApiRuntimeContext;
  occurrenceId: string;
  retained: RetainedEntityAdmission;
  state: InventoryState;
}>;

/**
 * Executes the whole-worldline admission inventory at one captured Tick, from
 * the lane's cone admission index (#1039): at most the Observer's limit of
 * admissions, resuming after its cursor when it has one.
 */
export async function startEntityAdmissionInventory<TValue extends ReadingValue>(
  timeline: Timeline,
  observer: Observer<TValue>,
  activity: RuntimeActivity,
): Promise<ObservationExecution<TValue>> {
  const lease = activity.acquire();
  try {
    const context = requireTimelineContext(timeline);
    const paging = requireEntityAdmissionInventoryPaging(observer);
    const tick = await inventoryTick(timeline, context, paging);
    const settlement = createReceiptSettlement();
    const readings = streamInventory({ context, lease, observer, paging, settlement, tick, timeline });
    return Object.freeze({ readings: WarpStream.from(readings), receipt: settlement.promise });
  } catch (error) {
    lease.release();
    if (error instanceof WarpError) {
      return obstructedExecution(timeline, observer, error.code);
    }
    throw error;
  }
}

/** Explicitly refuses inventory on strands until their overlay source is defined. */
export function unsupportedStrandEntityAdmissionInventory<
  TValue extends ReadingValue,
>(
  timeline: Readonly<{ readonly name: string; readonly writer: string }>,
  observer: Observer<TValue>,
): ObservationExecution<TValue> {
  return obstructedExecution(
    timeline,
    observer,
    'entity_admission_inventory_strand_unavailable',
  );
}

async function* streamInventory<TValue extends ReadingValue>(
  options: InventoryOptions<TValue>,
): AsyncIterable<Reading<TValue>> {
  let terminal = false;
  try {
    yield* inventoryReadings(options);
    terminal = true;
  } catch (error) {
    const failure = error instanceof WarpError ? error : null;
    options.settlement.resolve(inventoryFailureReceipt(options, failure));
    terminal = true;
  } finally {
    if (!terminal) {
      options.settlement.resolve(cancelledReceipt(options));
    }
    options.lease.release();
  }
}

async function* inventoryReadings<TValue extends ReadingValue>(
  options: InventoryOptions<TValue>,
): AsyncIterable<Reading<TValue>> {
  const state = await createInventoryState(options);
  const runtime = requireTimelineRuntime(options.timeline);
  const basis = requireEntityAdmissionInventoryBasis(runtime, options.tick);
  const merge = await openEntityAdmissions(runtime, basis, options.paging.resume?.cursor.remaining ?? null);
  for (let emittedCount = 0; emittedCount < options.paging.limit; emittedCount += 1) {
    const retained = await merge.next();
    if (retained === null) {
      await settleCompletedInventory(options, state);
      return;
    }
    const emitted = await emittedAdmission(options, retained, state.admissionCount);
    await updateInventoryState({
      context: options.context,
      occurrenceId: emitted.occurrenceId,
      retained,
      state,
    });
    yield emitted.reading;
  }
  await settleInventoryPage(options, state, merge);
}

/** The Tick the Observation inventories: the lane's current basis, or the basis its cursor resumes. */
async function inventoryTick(
  timeline: Timeline,
  context: ApiRuntimeContext,
  paging: EntityAdmissionInventoryPaging,
): Promise<Tick> {
  await requireResumableCursor(context, timeline, paging);
  const resumeBasisId = paging.resume?.cursor.basisId ?? null;
  return await createEntityAdmissionInventoryTick(requireTimelineRuntime(timeline), context, resumeBasisId);
}

/** Refuses a cursor of another Lane or one whose check digest does not match its contents. */
async function requireResumableCursor(
  context: ApiRuntimeContext,
  timeline: Timeline,
  paging: EntityAdmissionInventoryPaging,
): Promise<void> {
  if (paging.resume === null) {
    return;
  }
  const { cursor, check } = paging.resume;
  if (cursor.lane !== timeline.name || await cursorCheck(context, cursor) !== check) {
    throw new WarpError('Entity admission inventory cursor does not resume this Lane', 'E_ENTITY_ADMISSION_INVENTORY_CURSOR');
  }
}

async function cursorCheck(context: ApiRuntimeContext, cursor: EntityAdmissionInventoryCursor): Promise<string> {
  return await context.createOpaqueId('admission', ['entity-admission-inventory-cursor', ...cursor.parts()]);
}

/**
 * Settles a page that reached its limit: complete when nothing is left, and
 * otherwise a completed page whose Receipt carries the cursor that resumes
 * it, with the basis retained so the cursor stays resumable.
 */
async function settleInventoryPage<TValue extends ReadingValue>(
  options: InventoryOptions<TValue>,
  state: InventoryState,
  merge: ConeAdmissionMerge,
): Promise<void> {
  const remaining = merge.positions();
  if ([...remaining.values()].every((count) => count === 0)) {
    await settleCompletedInventory(options, state);
    return;
  }
  await retainEntityAdmissionInventoryTick(requireTimelineRuntime(options.timeline), options.tick);
  const cursor = new EntityAdmissionInventoryCursor({
    lane: options.timeline.name,
    basisId: options.tick.id,
    admissionCount: state.admissionCount,
    streamDigest: state.streamDigest,
    remaining,
  });
  const receipt = new ObservationReceipt({
    evidence: tickEvidence(options.tick),
    lane: options.timeline.name,
    observer: options.observer,
    status: 'completed',
    writer: options.timeline.writer,
  });
  bindEntityAdmissionInventoryContinuation(receipt, cursor.encode(await cursorCheck(options.context, cursor)));
  options.settlement.resolve(receipt);
}

async function emittedAdmission<TValue extends ReadingValue>(
  options: InventoryOptions<TValue>,
  retained: RetainedEntityAdmission,
  ordinal: number,
): Promise<EmittedAdmission<TValue>> {
  const evidence = await createEntityAdmissionInventoryEvidence({
    context: options.context,
    operationIndex: retained.eventId.opIndex,
    patchSha: retained.eventId.patchSha,
    tick: options.tick,
  });
  const occurrence = retainedOccurrence(retained, evidence, options.timeline.name);
  const admission = await publicAdmission({
    context: options.context,
    occurrenceId: occurrence.id,
    ordinal,
    retained,
  });
  return Object.freeze({
    occurrenceId: occurrence.id,
    reading: new Reading<TValue>({
      evidence,
      lane: options.timeline.name,
      value: decodeObserverValue(options.observer, admission),
    }),
  });
}

function retainedOccurrence(
  retained: RetainedEntityAdmission,
  evidence: Evidence,
  worldline: string,
): ReturnType<typeof createEntityOccurrence> {
  return createEntityOccurrence({
    context: retained.context,
    dot: retained.dot,
    evidence,
    eventId: retained.eventId,
    intent: retained.intent,
    receiptWriter: retained.eventId.writerId,
    subject: retained.subject,
    worldline,
  });
}

async function publicAdmission(options: Readonly<{
  context: ApiRuntimeContext;
  occurrenceId: string;
  ordinal: number;
  retained: RetainedEntityAdmission;
}>): Promise<EntityAdmission> {
  return new EntityAdmission({
    occurrenceId: options.occurrenceId,
    orderingKey: await options.context.createOpaqueId('admission', [
      'entity-admission-inventory-order',
      options.ordinal,
      options.occurrenceId,
    ]),
    origin: options.retained.origin,
    properties: options.retained.properties,
    subject: options.retained.subject,
  });
}

async function createInventoryState<TValue extends ReadingValue>(
  options: InventoryOptions<TValue>,
): Promise<InventoryState> {
  const resumed = options.paging.resume?.cursor ?? null;
  if (resumed !== null) {
    return { admissionCount: resumed.admissionCount, streamDigest: resumed.streamDigest };
  }
  return {
    admissionCount: 0,
    streamDigest: await options.context.createOpaqueId('admission', [
      'entity-admission-inventory-stream',
      ENTITY_ADMISSION_INVENTORY_SCHEMA,
      'empty',
    ]),
  };
}

async function updateInventoryState(options: StateUpdateOptions): Promise<void> {
  const { retained, state } = options;
  state.streamDigest = await options.context.createOpaqueId('admission', [
    'entity-admission-inventory-stream',
    ENTITY_ADMISSION_INVENTORY_SCHEMA,
    state.streamDigest,
    options.occurrenceId,
    retained.subject,
    retained.origin.kind,
    retained.origin.namespace ?? '',
    canonicalStringify(retained.properties),
  ]);
  state.admissionCount += 1;
}

async function completeInventory<TValue extends ReadingValue>(
  options: InventoryOptions<TValue>,
  state: InventoryState,
): Promise<EntityAdmissionInventoryCertificate> {
  const [causalDomainId, selectorDigest, evidence] = await inventoryIdentity(
    options,
    state,
  );
  return new EntityAdmissionInventoryCertificate({
    admissionCount: state.admissionCount,
    basisId: options.tick.id,
    causalDomainId,
    evidence,
    lane: { kind: 'worldline', name: options.timeline.name },
    selectorDigest,
    streamDigest: state.streamDigest,
  });
}

async function inventoryIdentity<TValue extends ReadingValue>(
  options: InventoryOptions<TValue>,
  state: InventoryState,
): Promise<readonly [string, string, Evidence]> {
  return await Promise.all([
    options.context.createOpaqueId('admission', [
      'entity-admission-inventory-domain', options.timeline.name,
    ]),
    options.context.createOpaqueId('admission', [
      'entity-admission-inventory-selector', 'lane', options.timeline.name,
    ]),
    createEntityAdmissionInventoryCertificateEvidence(
      options.context, options.tick, state.streamDigest,
    ),
  ]);
}

async function settleCompletedInventory<TValue extends ReadingValue>(
  options: InventoryOptions<TValue>,
  state: InventoryState,
): Promise<void> {
  const certificate = await completeInventory(options, state);
  const receipt = new ObservationReceipt({
    evidence: certificate.evidence,
    lane: options.timeline.name,
    observer: options.observer,
    status: 'completed',
    writer: options.timeline.writer,
  });
  bindEntityAdmissionInventoryCertificate(receipt, certificate);
  options.settlement.resolve(receipt);
}

function inventoryFailureReceipt<TValue extends ReadingValue>(
  options: {
    readonly observer: Observer<TValue>;
    readonly tick: Tick;
    readonly timeline: Timeline;
  },
  error: WarpError | null,
): ObservationReceipt {
  const reason = error?.code ?? 'entity_admission_inventory_failed';
  return new ObservationReceipt({
    evidence: tickEvidence(options.tick),
    lane: options.timeline.name,
    observer: options.observer,
    reason,
    status: 'obstructed',
    writer: options.timeline.writer,
  });
}

function cancelledReceipt<TValue extends ReadingValue>(options: {
  readonly observer: Observer<TValue>;
  readonly tick: Tick;
  readonly timeline: Timeline;
}): ObservationReceipt {
  return new ObservationReceipt({
    evidence: tickEvidence(options.tick),
    lane: options.timeline.name,
    observer: options.observer,
    reason: 'consumer_cancelled',
    status: 'obstructed',
    writer: options.timeline.writer,
  });
}

function obstructedExecution<TValue extends ReadingValue>(
  timeline: Readonly<{ readonly name: string; readonly writer: string }>,
  observer: Observer<TValue>,
  reason: string,
): ObservationExecution<TValue> {
  return Object.freeze({
    readings: WarpStream.from<Reading<TValue>>([]),
    receipt: Promise.resolve(new ObservationReceipt({
      lane: timeline.name,
      observer,
      reason,
      status: 'obstructed',
      writer: timeline.writer,
    })),
  });
}

function tickEvidence(tick: Tick) {
  return Object.freeze({
    basis: Object.freeze({ id: tick.id }),
    support: Object.freeze([]),
    tick,
  });
}

function createReceiptSettlement(): ReceiptSettlement {
  const { promise, resolve } = Promise.withResolvers<ObservationReceipt>();
  return Object.freeze({
    promise,
    resolve,
  });
}
