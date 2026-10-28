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
import ContentReadBasis from '../domain/services/ContentReadBasis.ts';
import { NODE_PROPERTY_CLEAR_SEMANTICS } from '../domain/services/state/NodeLifecycle.ts';
import { captureContentReadBasis, projectContent } from '../domain/services/ContentReadRuntime.ts';
import WarpStream from '../domain/stream/WarpStream.ts';
import WarpError from '../domain/errors/WarpError.ts';
import ConeObstructedError from '../domain/errors/ConeObstructedError.ts';
import { coneObstructionFailure } from '../domain/api/ConeObstructionFailure.ts';
import ConeContentRead from '../domain/services/ConeContentRead.ts';
import type ConeLaneBasis from '../domain/services/cone/ConeLaneBasis.ts';
import type RuntimeActivity from './RuntimeActivity.ts';
import { createContentReadingValue } from './RuntimeContentReading.ts';

type ContentObservationSource = Readonly<{
  lane: Readonly<{ name: string; writer: string }>;
  runtime: WarpWorldline;
  context: ApiRuntimeContext;
  basis: ContentReadBasis;
}>;

export function startContentObservation<TValue extends ReadingValue>(fields: {
  timeline: Timeline; observer: Observer<TValue>; owner: ContentOwner; activity: RuntimeActivity;
}): Promise<ObservationExecution<TValue>> {
  return fields.activity.run(async () => {
    try {
      const runtime = requireTimelineRuntime(fields.timeline);
      const cone = runtime.coneBasis();
      if (cone !== null) {
        return await observeConeContent({ ...fields, runtime, cone, context: requireTimelineContext(fields.timeline) });
      }
      return await observeContent({
        ...fields, source: { lane: fields.timeline, runtime, context: requireTimelineContext(fields.timeline),
          basis: await captureContentReadBasis(runtime) },
      });
    } catch (error) {
      if (error instanceof ConeObstructedError) { return coneContentFailure(fields.timeline, fields.observer, error); }
      if (!(error instanceof WarpError)) { throw error; }
      return contentFailure(fields.timeline, fields.observer, error.code);
    }
  });
}

/** Reads the owner's attachment from the lane's cone records at one advanced basis (#1039). */
async function observeConeContent<TValue extends ReadingValue>(fields: {
  timeline: Timeline; observer: Observer<TValue>; owner: ContentOwner; activity: RuntimeActivity;
  runtime: WarpWorldline; cone: ConeLaneBasis; context: ApiRuntimeContext;
}): Promise<ObservationExecution<TValue>> {
  const { timeline, observer, owner, activity, runtime } = fields;
  const read = await ConeContentRead.read(fields.cone, owner);
  const storage = requireContentStorage(runtime);
  const value = read.record === null ? null : createContentReadingValue({ payload: read.record.payload, owner, storage, activity });
  const evidence = await coneContentEvidence({ context: fields.context, lane: timeline, runtime, read, owner });
  return Object.freeze({
    readings: WarpStream.from([new Reading({ evidence, lane: timeline.name, value: decodeObserverValue(observer, value) })]),
    receipt: Promise.resolve(new ObservationReceipt({
      evidence, lane: timeline.name, writer: timeline.writer, observer, status: 'completed',
    })),
  });
}

async function coneContentEvidence(source: {
  context: ApiRuntimeContext; lane: Readonly<{ name: string }>; runtime: WarpWorldline; read: ConeContentRead; owner: ContentOwner;
}) {
  const { context, lane, runtime, read } = source;
  const root = read.basis.root.toString();
  const frontier = read.basis.frontier.entries().flatMap(([writer, position]) => [writer, position.sha]);
  const tick = new Tick({ timeline: lane.name, id: await context.createOpaqueId('tick', [
    'content-cone', runtime.worldlineName, lane.name, root, ...frontier,
  ]) });
  const support = await context.createOpaqueId('evidence', [
    'content-cone-projection', NODE_PROPERTY_CLEAR_SEMANTICS, tick.id, ...ownerIdentity(source.owner),
    ...read.records.map((key) => key.toString()),
  ]);
  return freezeEvidence({ basis: { id: tick.id }, tick, support: [{ id: support }] }, 'content.evidence');
}

function ownerIdentity(owner: ContentOwner): readonly string[] {
  const { descriptor } = owner;
  return descriptor.kind === 'node' ? [descriptor.kind, descriptor.subject] : [descriptor.kind, descriptor.from, descriptor.to, descriptor.label];
}

function coneContentFailure<TValue extends ReadingValue>(
  lane: Readonly<{ name: string; writer: string }>, observer: Observer<TValue>, error: ConeObstructedError,
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

export function startStrandContentObservation<TValue extends ReadingValue>(fields: {
  draft: DraftTimeline; observer: Observer<TValue>; owner: ContentOwner; activity: RuntimeActivity;
}): Promise<ObservationExecution<TValue>> {
  return fields.activity.run(async () => {
    try {
      const state = requireDraftStateForReading(fields.draft);
      if (state.forkedAt === null) { throw new WarpError('Strand has no captured coordinate', 'E_CONTENT_READ_BASIS'); }
      const captured = await state.runtime.prepareStrandOptic(fields.draft.name, state.forkedAt.requireCheckpointSha());
      return await observeContent({ ...fields, source: {
        lane: fields.draft, runtime: state.runtime, context: state.context,
        basis: new ContentReadBasis(new Map(captured.frontierEntries.map(({ writerId, patchSha }) => [writerId, patchSha]))),
      } });
    } catch (error) {
      if (!(error instanceof WarpError)) { throw error; }
      return contentFailure(fields.draft, fields.observer, error.code);
    }
  });
}

async function observeContent<TValue extends ReadingValue>(fields: {
  source: ContentObservationSource; observer: Observer<TValue>; owner: ContentOwner; activity: RuntimeActivity;
}): Promise<ObservationExecution<TValue>> {
  const { source, observer, owner, activity } = fields;
  const record = await projectContent(source.runtime, owner, source.basis);
  const storage = requireContentStorage(source.runtime);
  const value = record === null ? null : createContentReadingValue({ payload: record.payload, owner, storage, activity });
  const evidence = await contentEvidence(source, owner);
  return Object.freeze({
    readings: WarpStream.from([new Reading({ evidence, lane: source.lane.name, value: decodeObserverValue(observer, value) })]),
    receipt: Promise.resolve(new ObservationReceipt({
      evidence, lane: source.lane.name, writer: source.lane.writer, observer, status: 'completed',
    })),
  });
}

function requireContentStorage(runtime: WarpWorldline): AssetStoragePort {
  if (runtime.assetStorage === null) { throw new WarpError('Content storage unavailable', 'E_CONTENT_STORAGE'); }
  return runtime.assetStorage;
}

async function contentEvidence(source: ContentObservationSource, owner: ContentOwner) {
  const { context, lane, runtime, basis } = source;
  const tick = new Tick({ timeline: lane.name, id: await context.createOpaqueId('tick', [
    'content-full-history', runtime.worldlineName, lane.name, ...basis.entries.flatMap(([writer, head]) => [writer, head]),
  ]) });
  const { descriptor } = owner;
  const identity = descriptor.kind === 'node' ? [descriptor.subject] : [descriptor.from, descriptor.to, descriptor.label];
  const support = await context.createOpaqueId('evidence', [
    'content-full-history-projection', NODE_PROPERTY_CLEAR_SEMANTICS, tick.id, descriptor.kind, ...identity,
  ]);
  return freezeEvidence({ basis: { id: tick.id }, tick, support: [{ id: support }] }, 'content.evidence');
}

function contentFailure<TValue extends ReadingValue>(
  lane: Readonly<{ name: string; writer: string }>, observer: Observer<TValue>, reason: string,
): ObservationExecution<TValue> {
  return Object.freeze({
    readings: WarpStream.from<Reading<TValue>>([]),
    receipt: Promise.resolve(new ObservationReceipt({
      lane: lane.name, writer: lane.writer, observer, status: 'obstructed', reason,
    })),
  });
}
