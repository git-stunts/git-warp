/**
 * v19 consumer smoke test -- compile-only.
 *
 * Exercises the root application API plus explicit storage subpath.
 */

import {
  intent,
  openWarp,
  reading,
  type AdmissionOutcome,
  type DraftTimeline,
  type Evidence,
  type EvidenceHandle,
  type Intent,
  type JoinReceipt,
  type JoinResult,
  type JoinOptions,
  type JoinPolicy,
  type NeighborhoodReadingFields,
  type OpenWarpOptions,
  type Reading,
  type ReadingResult,
  type ReadingValue,
  type ReadReceipt,
  type RepairHint,
  type Tick,
  type Timeline,
  type TimelineView,
  type Warp,
  type WarpStorage,
  type WriteReceipt,
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
const outcome: AdmissionOutcome = receipt.outcome;
const writeEvidence: Evidence = receipt.evidence;
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
const readOutcome = readReceipt.outcome;
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
const joinOutcome = joinReceipt.outcome;

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
void admissionWitnessHandle(outcome);
void writeEvidence;
void readValue;
void convenienceValue;
void neighborhoodRequest;
void readOutcome;
void readEvidence;
void evidenceBasis;
void repairHints;
void draftReceipt;
void preview;
void joinReceipt;
void joinOutcome;

await storage.close();
