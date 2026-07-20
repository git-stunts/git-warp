/**
 * @module
 *
 * Public v19 application boundary.
 *
 * Root users should write intents, read timelines, and keep receipts. The
 * graph-first compatibility surface is no longer publicly exported.
 * Opaque evidence is part of this first-use boundary. Storage adapters live
 * under `@git-stunts/git-warp/storage`; formal optic, coordinate, and witness
 * machinery lives under `@git-stunts/git-warp/advanced`; operator inspection
 * tools live under `@git-stunts/git-warp/diagnostics`.
 */

export { openWarp } from './src/application/openWarp.ts';
export { intent } from './src/domain/api/IntentBuilders.ts';
export { reading } from './src/domain/api/ReadingBuilders.ts';
export type { default as DraftTimeline } from './src/domain/api/DraftTimeline.ts';
export type { default as Warp } from './src/domain/api/Warp.ts';
export type { default as Timeline } from './src/domain/api/Timeline.ts';
export type { default as Tick } from './src/domain/api/Tick.ts';
export type { default as TimelineView } from './src/domain/api/TimelineView.ts';
export type { default as Evidence, EvidenceHandle } from './src/domain/api/Evidence.ts';
export type { default as Intent } from './src/domain/api/Intent.ts';
export type { default as JoinReceipt } from './src/domain/api/JoinReceipt.ts';
export type { default as JoinResult } from './src/domain/api/JoinResult.ts';
export type { default as Reading } from './src/domain/api/Reading.ts';
export type { default as ReadingResult } from './src/domain/api/ReadingResult.ts';
export type { default as ReadReceipt } from './src/domain/api/ReadReceipt.ts';
export type { default as WriteReceipt } from './src/domain/api/WriteReceipt.ts';
export type { AdmissionOutcome } from './src/domain/api/AdmissionOutcome.ts';
export type { OpenWarpOptions } from './src/application/openWarp.ts';
export type { default as WarpStorage } from './src/application/WarpStorage.ts';
export type {
  EdgeIntentFields,
  IntentDescriptor,
  IntentKind,
  NodeIntentFields,
  PropertyIntentFields,
} from './src/domain/api/Intent.ts';
export type { IntentBuilders } from './src/domain/api/IntentBuilders.ts';
export type { JoinMode, JoinReceiptOptions } from './src/domain/api/JoinReceipt.ts';
export type { JoinResultOptions } from './src/domain/api/JoinResult.ts';
export type { JoinOptions, JoinPolicy } from './src/domain/api/Timeline.ts';
export type {
  NeighborhoodReadingFields,
  NodeReadingFields,
  PropertyReadingFields,
  ReadingDirection,
  ReadingDescriptor,
  ReadingKind,
} from './src/domain/api/Reading.ts';
export type { ReadingBuilders } from './src/domain/api/ReadingBuilders.ts';
export type { ReadingResultOptions, ReadingValue } from './src/domain/api/ReadingResult.ts';
export type { Receipt } from './src/domain/api/Receipt.ts';
export type { ReadReceiptOptions } from './src/domain/api/ReadReceipt.ts';
export type { RepairHint } from './src/domain/api/ReceiptSupport.ts';
export type { WriteReceiptOptions } from './src/domain/api/WriteReceipt.ts';
