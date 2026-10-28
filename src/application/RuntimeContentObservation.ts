import type Timeline from '../domain/api/Timeline.ts';
import type DraftTimeline from '../domain/api/DraftTimeline.ts';
import { requireTimelineContext, requireTimelineRuntime } from '../domain/api/TimelineRuntime.ts';
import { requireDraftStateForReading } from '../domain/api/DraftTimelineRuntime.ts';
import type Observer from '../domain/api/Observer.ts';
import type ContentOwner from '../domain/api/ContentOwner.ts';
import type { ReadingValue } from '../domain/api/ReadingValue.ts';
import type { ObservationExecution } from '../domain/api/Observation.ts';
import type { ApiRuntimeContext } from '../domain/api/ApiRuntimeContext.ts';
import type WarpWorldline from '../domain/WarpWorldline.ts';
import type AssetStoragePort from '../ports/AssetStoragePort.ts';
import Reading from '../domain/api/ObservedReading.ts';
import ObservationReceipt from '../domain/api/ObservationReceipt.ts';
import Tick from '../domain/api/Tick.ts';
import { decodeObserverValue } from '../domain/api/ObserverRuntime.ts';
import { freezeEvidence } from '../domain/api/EvidenceRuntime.ts';
import { NODE_PROPERTY_CLEAR_SEMANTICS } from '../domain/services/state/NodeLifecycle.ts';
import WarpStream from '../domain/stream/WarpStream.ts';
import WarpError from '../domain/errors/WarpError.ts';
import ConeObstructedError from '../domain/errors/ConeObstructedError.ts';
import { coneObstructionFailure } from '../domain/api/ConeObstructionFailure.ts';
import ConeContentRead from '../domain/services/ConeContentRead.ts';
import type ConeLaneBasis from '../domain/services/cone/ConeLaneBasis.ts';
import type RuntimeActivity from './RuntimeActivity.ts';
import { createContentReadingValue } from './RuntimeContentReading.ts';

type ObservedLane = Readonly<{ name: string; writer: string }>;

/** Where one content Observation reads: a Lane's cone basis, worldline or strand (#1039). */
type ContentConeSource = Readonly<{
  lane: ObservedLane;
  runtime: WarpWorldline;
  cone: ConeLaneBasis;
  context: ApiRuntimeContext;
}>;

type ContentObservationFields<TValue extends ReadingValue> = {
  observer: Observer<TValue>; owner: ContentOwner; activity: RuntimeActivity;
};

export function startContentObservation<TValue extends ReadingValue>(
  fields: ContentObservationFields<TValue> & { timeline: Timeline },
): Promise<ObservationExecution<TValue>> {
  return observeContentOrReceipt(fields.timeline, fields, () => {
    const runtime = requireTimelineRuntime(fields.timeline);
    return { lane: fields.timeline, runtime, cone: runtime.coneBasis(), context: requireTimelineContext(fields.timeline) };
  });
}

export function startStrandContentObservation<TValue extends ReadingValue>(
  fields: ContentObservationFields<TValue> & { draft: DraftTimeline },
): Promise<ObservationExecution<TValue>> {
  return observeContentOrReceipt(fields.draft, fields, () => {
    const state = requireDraftStateForReading(fields.draft);
    return { lane: fields.draft, runtime: state.runtime, cone: state.strand.strand, context: state.context };
  });
}

/** Runs one content Observation; an obstructed basis or a refused read becomes its Receipt. */
function observeContentOrReceipt<TValue extends ReadingValue>(
  lane: ObservedLane,
  fields: ContentObservationFields<TValue>,
  source: () => ContentConeSource,
): Promise<ObservationExecution<TValue>> {
  return fields.activity.run(async () => {
    try {
      return await observeConeContent(source(), fields);
    } catch (error) {
      if (error instanceof ConeObstructedError) { return coneContentFailure(lane, fields.observer, error); }
      if (!(error instanceof WarpError)) { throw error; }
      return contentFailure(lane, fields.observer, error.code);
    }
  });
}

/** Reads the owner's attachment from the Lane's cone records at one advanced basis (#1039). */
async function observeConeContent<TValue extends ReadingValue>(
  source: ContentConeSource,
  fields: ContentObservationFields<TValue>,
): Promise<ObservationExecution<TValue>> {
  const { observer, owner, activity } = fields;
  const read = await ConeContentRead.read(source.cone, owner);
  const storage = requireContentStorage(source.runtime);
  const value = read.record === null ? null : createContentReadingValue({ payload: read.record.payload, owner, storage, activity });
  const evidence = await coneContentEvidence(source, read, owner);
  return Object.freeze({
    readings: WarpStream.from([new Reading({ evidence, lane: source.lane.name, value: decodeObserverValue(observer, value) })]),
    receipt: Promise.resolve(new ObservationReceipt({
      evidence, lane: source.lane.name, writer: source.lane.writer, observer, status: 'completed',
    })),
  });
}

async function coneContentEvidence(source: ContentConeSource, read: ConeContentRead, owner: ContentOwner) {
  const { context, lane, runtime } = source;
  const root = read.basis.root.toString();
  const frontier = read.basis.frontier.entries().flatMap(([writer, position]) => [writer, position.sha]);
  const tick = new Tick({ timeline: lane.name, id: await context.createOpaqueId('tick', [
    'content-cone', runtime.worldlineName, lane.name, root, ...frontier,
  ]) });
  const support = await context.createOpaqueId('evidence', [
    'content-cone-projection', NODE_PROPERTY_CLEAR_SEMANTICS, tick.id, ...ownerIdentity(owner),
    ...read.records.map((key) => key.toString()),
  ]);
  return freezeEvidence({ basis: { id: tick.id }, tick, support: [{ id: support }] }, 'content.evidence');
}

function ownerIdentity(owner: ContentOwner): readonly string[] {
  const { descriptor } = owner;
  return descriptor.kind === 'node' ? [descriptor.kind, descriptor.subject] : [descriptor.kind, descriptor.from, descriptor.to, descriptor.label];
}

function coneContentFailure<TValue extends ReadingValue>(
  lane: ObservedLane, observer: Observer<TValue>, error: ConeObstructedError,
): ObservationExecution<TValue> {
  const failure = coneObstructionFailure(error.obstruction);
  return Object.freeze({
    readings: WarpStream.from<Reading<TValue>>([]),
    receipt: Promise.resolve(new ObservationReceipt({
      lane: lane.name, writer: lane.writer, observer, status: failure.outcome, reason: failure.reason,
      repairHints: failure.repairHints,
    })),
  });
}

function requireContentStorage(runtime: WarpWorldline): AssetStoragePort {
  if (runtime.assetStorage === null) { throw new WarpError('Content storage unavailable', 'E_CONTENT_STORAGE'); }
  return runtime.assetStorage;
}

function contentFailure<TValue extends ReadingValue>(
  lane: ObservedLane, observer: Observer<TValue>, reason: string,
): ObservationExecution<TValue> {
  return Object.freeze({
    readings: WarpStream.from<Reading<TValue>>([]),
    receipt: Promise.resolve(new ObservationReceipt({
      lane: lane.name, writer: lane.writer, observer, status: 'obstructed', reason,
    })),
  });
}
