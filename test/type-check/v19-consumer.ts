/**
 * v19 consumer smoke test -- compile-only.
 *
 * Exercises the root application API plus explicit storage subpath.
 */

import {
  intent,
  openWarp,
  reading,
  type DraftTimeline,
  type Evidence,
  type EvidenceHandle,
  type Intent,
  type JoinOutcome,
  type JoinReceipt,
  type JoinResult,
  type JoinOptions,
  type JoinPolicy,
  type NeighborhoodReadingFields,
  type OpenWarpOptions,
  type ReadOutcome,
  type Reading,
  type ReadingResult,
  type ReadingValue,
  type ReadReceipt,
  type ReceiptOutcome,
  type RepairHint,
  type Tick,
  type Timeline,
  type TimelineView,
  type Warp,
  type WarpStorage,
  type WriteReceipt,
  type WriteOutcome,
} from '../../index.ts';
import { GitStorage } from '../../storage.ts';

const storage = await GitStorage.open({ cwd: '.' });
const publicStorage: WarpStorage = storage;

const options: OpenWarpOptions = {
  storage: publicStorage,
  writer: 'agent-1',
};

const warp: Warp = await openWarp(options);
const timeline: Timeline = await warp.timeline('events');
const timelineName: string = timeline.name;
const timelineWriter: string = timeline.writer;
const tick: Tick = await timeline.tick();
const historical: TimelineView = timeline.at(tick);

// @ts-expect-error formal coordinate capture lives on the advanced subpath.
await timeline.coordinate();
const writeIntent: Intent = intent.property.set({
  subject: 'user:alice',
  key: 'role',
  value: 'admin',
});
const receipt: WriteReceipt = await timeline.write(writeIntent);
const outcome: WriteOutcome = receipt.outcome;
const readRequest: Reading = reading.property({
  subject: 'user:alice',
  key: 'role',
});
const neighborhoodFields: NeighborhoodReadingFields = {
  subject: 'user:alice',
  direction: 'out',
  labels: ['memberOf'],
  limit: 25,
};
const neighborhoodRequest: Reading = reading.neighborhood(neighborhoodFields);
const readResult: ReadingResult = await timeline.read(readRequest);
const historicalResult: ReadingResult = await historical.read(readRequest);
const convenienceValue: ReadingValue = await timeline.readValue(readRequest);
const readValue: ReadingValue = readResult.value;
const readReceipt: ReadReceipt = readResult.receipt;
const readOutcome: ReadOutcome = readReceipt.outcome;
const readEvidence: Evidence | undefined = readReceipt.evidence;
const evidenceBasis: EvidenceHandle | undefined = readEvidence?.basis;
const repairHints: readonly RepairHint[] = readReceipt.repairHints;
const draft: DraftTimeline = await timeline.draft('try-admin-role');
const draftReceipt: WriteReceipt = await draft.write(writeIntent);
const joinPolicy: JoinPolicy = 'deterministic';
const joinOptions: JoinOptions = { policy: joinPolicy };
const preview: JoinResult = await timeline.previewJoin(draft, joinOptions);
const joined: JoinResult = await timeline.join(draft);
const joinReceipt: JoinReceipt = joined.receipt;
const joinOutcome: JoinOutcome = joinReceipt.outcome;
const acceptedOutcome: ReceiptOutcome = 'accepted';

// @ts-expect-error receipt outcomes do not expose operation names.
const operationOutcome: ReceiptOutcome = 'write';

// @ts-expect-error read receipt outcomes do not expose operation names.
const readOperationOutcome: ReadOutcome = 'read';

// @ts-expect-error resolved is not a receipt outcome in the v19 contract.
const retiredReadOutcome: ReadOutcome = 'resolved';

// @ts-expect-error previewJoin is a dedicated method, not a dryRun boolean trap.
await timeline.previewJoin(draft, { dryRun: true });

// @ts-expect-error timelines do not expose legacy worldline names.
timeline.worldlineName;

// @ts-expect-error timelines do not expose legacy writer ids.
timeline.writerId;

// @ts-expect-error timelines do not expose patch commits.
timeline.commit;

// @ts-expect-error write receipts expose opaque evidence, not substrate ids.
receipt.patchSha;

// @ts-expect-error join receipts expose opaque evidence, not substrate ids.
joinReceipt.patchShas;

// @ts-expect-error read evidence does not expose checkpoint object ids.
readReceipt.evidence?.checkpointSha;

void timelineName;
void timelineWriter;
void historicalResult;
void outcome;
void acceptedOutcome;
void operationOutcome;
void readValue;
void convenienceValue;
void neighborhoodRequest;
void readOutcome;
void readEvidence;
void evidenceBasis;
void readOperationOutcome;
void retiredReadOutcome;
void repairHints;
void draftReceipt;
void preview;
void joinReceipt;
void joinOutcome;

await storage.close();
