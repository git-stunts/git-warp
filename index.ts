/**
 * @module
 *
 * Public v19 application boundary.
 *
 * Root users should write intents, read timelines, and keep receipts. The
 * graph-first compatibility surface is deprecated and isolated under
 * `@git-stunts/git-warp/legacy` for migration-only use.
 * Storage adapters live under `@git-stunts/git-warp/storage`; formal read,
 * evidence, and support machinery lives under `@git-stunts/git-warp/advanced`;
 * operator inspection tools live under `@git-stunts/git-warp/diagnostics`.
 */

import { installDefaultRuntimeHostNodePorts } from './src/application/RuntimeHostNodeDefaults.ts';

installDefaultRuntimeHostNodePorts();

export { openWarp } from './src/domain/api/openWarp.ts';
export { default as DraftTimeline } from './src/domain/api/DraftTimeline.ts';
export { default as Warp } from './src/domain/api/Warp.ts';
export { default as Timeline } from './src/domain/api/Timeline.ts';
export { intent } from './src/domain/api/IntentBuilders.ts';
export { default as Intent } from './src/domain/api/Intent.ts';
export { default as JoinReceipt } from './src/domain/api/JoinReceipt.ts';
export { default as JoinResult } from './src/domain/api/JoinResult.ts';
export { reading } from './src/domain/api/ReadingBuilders.ts';
export { default as Reading } from './src/domain/api/Reading.ts';
export { default as ReadingResult } from './src/domain/api/ReadingResult.ts';
export { default as ReadReceipt } from './src/domain/api/ReadReceipt.ts';
export { default as WriteReceipt } from './src/domain/api/WriteReceipt.ts';
export type { OpenWarpOptions, WarpStorage } from './src/domain/api/openWarp.ts';
export type {
  EdgeIntentFields,
  EdgePropertyIntentFields,
  IntentDescriptor,
  IntentKind,
  NodeIntentFields,
  PropertyIntentFields,
} from './src/domain/api/Intent.ts';
export type { IntentBuilders } from './src/domain/api/IntentBuilders.ts';
export type { JoinMode, JoinReceiptOptions, JoinReceiptOutcome } from './src/domain/api/JoinReceipt.ts';
export type { JoinResultOptions } from './src/domain/api/JoinResult.ts';
export type { JoinOptions, JoinPolicy } from './src/domain/api/Timeline.ts';
export type {
  NodeReadingFields,
  PropertyReadingFields,
  ReadingDescriptor,
  ReadingKind,
} from './src/domain/api/Reading.ts';
export type { ReadingBuilders } from './src/domain/api/ReadingBuilders.ts';
export type { ReadingResultOptions, ReadingValue } from './src/domain/api/ReadingResult.ts';
export type { ReadReceiptOptions, ReadReceiptOutcome } from './src/domain/api/ReadReceipt.ts';
export type { ReceiptOutcome, WriteReceiptOptions } from './src/domain/api/WriteReceipt.ts';
