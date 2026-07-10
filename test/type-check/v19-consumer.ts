/**
 * v19 consumer smoke test -- compile-only.
 *
 * Exercises the root application API plus explicit storage subpath.
 */

import {
  DraftTimeline,
  intent,
  Intent,
  JoinReceipt,
  JoinResult,
  openWarp,
  reading,
  Reading,
  ReadingResult,
  ReadReceipt,
  Timeline,
  Warp,
  WriteReceipt,
  type OpenWarpOptions,
  type JoinOptions,
  type JoinPolicy,
  type ReadReceiptOutcome,
  type ReadingValue,
  type ReceiptOutcome,
  type WarpStorage,
} from '../../index.ts';
import { MemoryStorageAdapter } from '../../storage.ts';

const storage = new MemoryStorageAdapter();
const publicStorage: WarpStorage = storage;

const options: OpenWarpOptions = {
  storage: publicStorage,
  writer: 'agent-1',
};

const warp: Warp = await openWarp(options);
const timeline: Timeline = await warp.timeline('events');
const timelineName: string = timeline.name;
const timelineWriter: string = timeline.writer;
const writeIntent: Intent = intent.property.set({
  subject: 'user:alice',
  key: 'role',
  value: 'admin',
});
const receipt: WriteReceipt = await timeline.write(writeIntent);
const outcome: ReceiptOutcome = receipt.outcome;
const readRequest: Reading = reading.property({
  subject: 'user:alice',
  key: 'role',
});
const readResult: ReadingResult = await timeline.read(readRequest);
const readValue: ReadingValue = readResult.value;
const readReceipt: ReadReceipt = readResult.receipt;
const readOutcome: ReadReceiptOutcome = readReceipt.outcome;
const draft: DraftTimeline = await timeline.draft('try-admin-role');
const draftReceipt: WriteReceipt = await draft.write(writeIntent);
const joinPolicy: JoinPolicy = 'deterministic';
const joinOptions: JoinOptions = { policy: joinPolicy };
const preview: JoinResult = await timeline.previewJoin(draft, joinOptions);
const joined: JoinResult = await timeline.join(draft);
const joinReceipt: JoinReceipt = joined.receipt;

// @ts-expect-error receipt outcomes do not expose operation names.
const operationOutcome: ReceiptOutcome = 'write';

// @ts-expect-error read receipt outcomes do not expose operation names.
const readOperationOutcome: ReadReceiptOutcome = 'read';

// @ts-expect-error previewJoin is a dedicated method, not a dryRun boolean trap.
await timeline.previewJoin(draft, { dryRun: true });

// @ts-expect-error timelines do not expose legacy worldline names.
timeline.worldlineName;

// @ts-expect-error timelines do not expose legacy writer ids.
timeline.writerId;

// @ts-expect-error timelines do not expose patch commits.
timeline.commit;

void timelineName;
void timelineWriter;
void outcome;
void operationOutcome;
void readValue;
void readOutcome;
void readOperationOutcome;
void draftReceipt;
void preview;
void joinReceipt;
