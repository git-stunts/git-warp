/** v21 root consumer contract -- compile-only. Writes go through Warp; reads keep the legacy Runtime path until #1052. */

import {
  GitStorage,
  RetainedWriteReceipt,
  Runtime,
  Warp,
  WarpAccessDenied,
  WarpAccessPort,
  WarpAddress,
  type ContentMetadataInput,
  type StagedContent,
  type EntityAdmission,
  type Evidence,
  type Intent,
  type Lane,
  type Observation,
  type ObservationReceipt,
  type Observer,
  type Reading,
  type Receipt,
  type RuntimeOpenOptions,
  type SupportReport,
  type Tick,
  type WriteIntentInput,
  type WriteReceipt,
} from '../../index.ts';
import { users } from '../fixtures/generated-sdk/users.generated.ts';
import { intent as buildIntent } from '../../advanced.ts';

declare const access: WarpAccessPort;
const warp: Warp = await Warp.open(WarpAddress.of(GitStorage.root(), 'events'), access);
const intent: Intent = users.intents.assignRole({
  subject: 'user:alice',
  role: 'admin',
});
const write: WriteReceipt = await warp.as('agent-1').execute(intent);
const intents: Intent[] = [intent, intent];
const writeInput: WriteIntentInput = intents;
const atomicWrite: WriteReceipt = await warp.as('agent-1').execute(writeInput);
if (write instanceof RetainedWriteReceipt) {
  const subject: string | undefined = write.occurrences[0]?.subject;
  void subject;
  void write.coordinate.toString();
}
declare const entityAdmission: EntityAdmission;

const options: RuntimeOpenOptions = { at: '.', writer: 'agent-1' };
const runtime: Runtime = await Runtime.open(options);
const lane: Lane = await runtime.lane('events');
const observer: Observer<string> = users.observers.roleOf({ subject: 'user:alice' });
const observation: Observation<string> = lane.observe(observer);
const emitted: Reading<string> = await observation.one();
const support: SupportReport = emitted.support;
const observationReceipt: ObservationReceipt = await observation.receipt;
const receipt: Receipt = observationReceipt;
const evidence: Evidence | undefined = observationReceipt.evidence;
const manyObservation: Observation<string> = lane.observe(users.observers.rolesOf({
  subjects: ['user:alice', 'user:bob'],
}));
for await (const reading of manyObservation) {
  const value: string = reading.value;
  void value;
}
const manyReceipt: ObservationReceipt = await manyObservation.receipt;

// @ts-expect-error Runtime does not expose transitional timelines.
await runtime.timeline('events');

// @ts-expect-error Lane has no writes in v21; write through Warp.
await lane.write(intent);

// @ts-expect-error Runtime has no forks in v21.
await runtime.fork(lane, { name: 'draft' });

// @ts-expect-error Lane observations require a runtime-backed Observer.
lane.observe({ id: 'loose-plan' });

// @ts-expect-error Observation receipts carry status, not admission outcome.
observationReceipt.outcome;

// @ts-expect-error Entity admissions expose only their named domain fields.
entityAdmission['arbitraryField'];

const readingTick: Tick | undefined = emitted.coordinate.tick;

void atomicWrite;
void readingTick;
void evidence;
void emitted.coordinate;
void emitted.witnessRefs;
void support;
void receipt;
void manyReceipt;
await runtime.close();
await warp.close();

/** Portable staging metadata is available without importing storage implementation types. */
async function stageContent(content: string, metadata: ContentMetadataInput): Promise<StagedContent | null> {
  const staged = await warp.as('agent-1').stage(content, metadata);
  if (staged instanceof WarpAccessDenied) {
    return null;
  }
  await warp.as('agent-1').execute([
    buildIntent.node.attachContent({ subject: 'document', content: staged }),
    buildIntent.edge.attachContent({ from: 'document', to: 'related', label: 'links', content: staged }),
    buildIntent.node.clearContent({ subject: 'document' }),
    buildIntent.edge.clearContent({ from: 'document', to: 'related', label: 'links' }),
  ]);
  // @ts-expect-error Attachment writes require a staged value, not raw bytes.
  buildIntent.node.attachContent({ subject: 'document', content: new Uint8Array([1]) });
  // @ts-expect-error An edge attachment requires its complete owner identity.
  buildIntent.edge.attachContent({ from: 'document', content: staged });
  // @ts-expect-error Staged metadata is immutable.
  staged.size = 42;
  return staged;
}

async function readContent(lane: Lane): Promise<void> {
  const { createNodeContentObserver, createEdgeContentObserver } = await import('@git-stunts/git-warp/advanced');
  const node = await lane.observe(createNodeContentObserver({ subject: 'document' })).one();
  const edge = await lane.observe(createEdgeContentObserver({ from: 'document', to: 'related', label: 'links' })).one();
  for (const reading of [node, edge]) {
    if (reading.value === null) { continue; }
    const stream: AsyncIterable<Uint8Array> = reading.value.open();
    const size: number | null = reading.value.size;
    void stream;
    void size;
    // @ts-expect-error Public content has no eager byte getter.
    reading.value.bytes();
  }
}

void stageContent;
void readContent;
