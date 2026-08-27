/** v19 root consumer contract -- compile-only. */

import {
  Runtime,
  type AdmissionOutcome,
  type EntityAdmission,
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
  type RuntimeForkOptions,
  type RuntimeOpenOptions,
  type RuntimeSettlementOptions,
  type SettlementPlan,
  type SettlementPreview,
  type SettlementReceipt,
  type SupportReport,
  type Tick,
  type WriteIntentInput,
  type WriteReceipt,
} from '../../index.ts';
import { users } from '../fixtures/generated-sdk/users.generated.ts';

const options: RuntimeOpenOptions = { at: '.', writer: 'agent-1' };
const runtime: Runtime = await Runtime.open(options);
const lane: Lane = await runtime.lane('events');
const forkOptions: RuntimeForkOptions = { name: 'try-admin-role' };
const strand: Lane = await runtime.fork(lane, forkOptions);
const intent: Intent = users.intents.assignRole({
  subject: 'user:alice',
  role: 'admin',
});
const write: WriteReceipt = await lane.write(intent);
const intents: Intent[] = [intent, intent];
const atomicWrite = await lane.write(intents);
const atomicIntentCount: number = atomicWrite.intents.length;
declare const normalizedArrayReceipt: WriteReceipt<Intent[]>;
// @ts-expect-error WriteReceipt retains an immutable normalized array snapshot.
normalizedArrayReceipt.intent.push(intent);
const writeInput: WriteIntentInput = intents;
const genericWrite = await lane.write(writeInput);
const admission: AdmissionOutcome = write.outcome;
declare const entityAdmission: EntityAdmission;
const writeEvidence: Evidence = write.evidence;
const writeLane: string = write.lane;
const observer: Observer<string> = users.observers.roleOf({ subject: 'user:alice' });
const observation: Observation<string> = lane.observe(observer);
const emitted: Reading<string> = await observation.one();
const support: SupportReport = emitted.support;
const observationReceipt: ObservationReceipt = await observation.receipt;
const receipt: Receipt = observationReceipt;
const manyObservation: Observation<string> = lane.observe(users.observers.rolesOf({
  subjects: ['user:alice', 'user:bob'],
}));
for await (const reading of manyObservation) {
  const value: string = reading.value;
  void value;
}
const manyReceipt: ObservationReceipt = await manyObservation.receipt;
const settlementOptions: RuntimeSettlementOptions = {
  source: strand,
  target: lane,
};
const settlementPreview: SettlementPreview =
  await runtime.previewSettlement(settlementOptions);
const settlementPlan: SettlementPlan = settlementPreview.plan;
const settlementReceipt: SettlementReceipt =
  await runtime.settle(settlementPlan);
const settlementPublicReceipt: Receipt = settlementReceipt;

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

// @ts-expect-error Entity admissions expose only their named domain fields.
entityAdmission['arbitraryField'];

const readingTick: Tick | undefined = emitted.coordinate.tick;

void admissionWitnessHandle(admission);
void laneName(lane.descriptor);
void laneName(strand.descriptor);
void writeEvidence;
void writeLane;
void atomicWrite;
void atomicIntentCount;
void readingTick;
void emitted.coordinate;
void emitted.witnessRefs;
void support;
void receipt;
void manyReceipt;
void settlementPublicReceipt;
await runtime.close();
