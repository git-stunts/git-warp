/**
 * v19 consumer smoke test -- compile-only.
 *
 * Exercises the root application API plus explicit storage subpath.
 */

import {
  intent,
  Intent,
  openWarp,
  Timeline,
  Warp,
  WriteReceipt,
  type OpenWarpOptions,
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

// @ts-expect-error receipt outcomes do not expose operation names.
const operationOutcome: ReceiptOutcome = 'write';

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
