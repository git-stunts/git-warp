/** v19 root consumer contract -- compile-only. */

import {
  Runtime,
  type AdmissionOutcome,
  type Evidence,
  type EvidenceHandle,
  type Intent,
  type Lane,
  type LaneDescriptor,
  type Observation,
  type ObservationReceipt,
  type Observer,
  type Reading,
  type Receipt,
  type RuntimeOpenOptions,
  type SupportReport,
  type Tick,
  type WriteReceipt,
} from '../../index.ts';
import { users } from './generated-users.ts';

const options: RuntimeOpenOptions = { at: '.', writer: 'agent-1' };
const runtime: Runtime = await Runtime.open(options);
const lane: Lane = await runtime.lane('events');
const intent: Intent = users.intents.assignRole({
  subject: 'user:alice',
  role: 'admin',
});
const write: WriteReceipt = await lane.write(intent);
const admission: AdmissionOutcome = write.outcome;
const writeEvidence: Evidence = write.evidence;
const writeLane: string = write.lane;
const observer: Observer<string> = users.observers.roleOf({ subject: 'user:alice' });
const observation: Observation<string> = lane.observe(observer);
const emitted: Reading<string> = await observation.one();
const support: SupportReport = emitted.support;
const observationReceipt: ObservationReceipt = await observation.receipt;
const receipt: Receipt = observationReceipt;

function admissionWitnessHandle(value: AdmissionOutcome): EvidenceHandle {
  switch (value.kind) {
    case 'derived':
      return value.witness.resultingFrontier;
    case 'plural':
      return value.witness.localCoordinate;
    case 'conflict':
      return value.witness.conflict;
    case 'obstruction':
      return value.witness.failedCondition;
  }
  const unreachable: never = value;
  return unreachable;
}

function laneName(descriptor: LaneDescriptor): string {
  if (descriptor.kind === 'worldline') {
    return descriptor.name;
  }
  return `${descriptor.parent.name}/${descriptor.name}@${descriptor.forkedAt.id}`;
}

// @ts-expect-error Runtime does not expose transitional timelines.
await runtime.timeline('events');

// @ts-expect-error Lane observations require a runtime-backed Observer.
lane.observe({ id: 'loose-plan' });

// @ts-expect-error Observation receipts carry status, not admission outcome.
observationReceipt.outcome;

// @ts-expect-error Canonical write receipts name their Lane, not a Timeline.
write.timeline;

const readingTick: Tick | undefined = emitted.coordinate.tick;

void admissionWitnessHandle(admission);
void laneName(lane.descriptor);
void writeEvidence;
void writeLane;
void readingTick;
void emitted.coordinate;
void emitted.witnessRefs;
void support;
void receipt;
await runtime.close();
