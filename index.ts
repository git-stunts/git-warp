/**
 * @module
 *
 * Public v19 application boundary.
 *
 * Write intents. Observe lanes. Keep receipts.
 *
 * `Warp` writes: `warp.as(writer).execute(intent)` returns a `WriteReceipt`. `Runtime`
 * keeps only the legacy read path (`Runtime.open()`, `runtime.lane()`, `Lane.observe`)
 * until #1052 replaces it with the Optic read. Generated SDKs provide validated
 * Intent and Observer values; formal optics and diagnostics remain on named
 * expert subpaths.
 */

export { default as Runtime } from './src/application/Runtime.ts';
export { default as Warp } from './src/application/Warp.ts';
export type { default as AuthoredWarp } from './src/application/AuthoredWarp.ts';
export { default as WarpAddress } from './src/application/WarpAddress.ts';
export { default as GitStorage } from './src/application/GitStorage.ts';
export { default as WarpAccessPort } from './src/ports/WarpAccessPort.ts';
export { default as WarpWriteGrant } from './src/domain/api/WarpWriteGrant.ts';
export type { WarpWriteBudget } from './src/domain/api/WarpWriteGrant.ts';
export { default as WarpAccessDenied } from './src/domain/api/WarpAccessDenied.ts';
export type { default as WarpWriteRequest } from './src/domain/api/WarpWriteRequest.ts';
export { default as Coordinate } from './src/domain/api/Coordinate.ts';
export { default as RetainedWriteReceipt } from './src/domain/api/RetainedWriteReceipt.ts';
export { default as UnretainedWriteReceipt } from './src/domain/api/UnretainedWriteReceipt.ts';
export { default as UnpublishedWriteReceipt } from './src/domain/api/UnpublishedWriteReceipt.ts';
export { default as IndeterminateWriteReceipt } from './src/domain/api/IndeterminateWriteReceipt.ts';
export { default as LoggerPort } from './src/ports/LoggerPort.ts';
export type { WarpOpenOptions } from './src/application/WarpOpenOptions.ts';
export type { default as LogFields } from './src/domain/types/log/LogFields.ts';
export type { default as LogFieldValue } from './src/domain/types/log/LogFieldValue.ts';
export type { WriteReceipt } from './src/domain/api/WriteReceipt.ts';
export type { default as WriteAdmission, WriteAdmissionKind } from './src/domain/api/WriteAdmission.ts';
export type { default as WriteOccurrence } from './src/domain/api/WriteOccurrence.ts';
export type { default as WritePublication } from './src/domain/api/WritePublication.ts';
export type { default as WriteRace } from './src/domain/api/WriteRace.ts';
export type { RuntimeOpenOptions } from './src/application/Runtime.ts';
export type { default as Evidence, EvidenceHandle } from './src/domain/api/Evidence.ts';
export type { default as Intent } from './src/domain/api/Intent.ts';
export type { WriteIntentInput } from './src/domain/api/IntentSequence.ts';
export type { default as Lane } from './src/domain/api/Lane.ts';
export type { ContentMetadataInput } from './src/domain/api/ContentMetadataInput.ts';
export type { default as StagedContent } from './src/domain/api/StagedContent.ts';
export type { default as Observation } from './src/domain/api/Observation.ts';
export type { default as ObservationReceipt } from './src/domain/api/ObservationReceipt.ts';
export type { ObservationStatus } from './src/domain/api/ObservationReceipt.ts';
export type { default as Observer } from './src/domain/api/Observer.ts';
export type { ObserverCardinality } from './src/domain/api/Observer.ts';
export type { default as Reading } from './src/domain/api/ObservedReading.ts';
export type {
  ReadingCoordinate,
  ReadingValue,
  SupportReport,
  WitnessReference,
} from './src/domain/api/ObservedReading.ts';
export type { default as Tick } from './src/domain/api/LaneTick.ts';
export type {
  default as EntityAdmission,
  EntityAdmissionInitialProperties,
  EntityAdmissionOccurrenceReference,
  EntityAdmissionOrdering,
  EntityAdmissionOriginReading,
  EntityAdmissionRepresentationReference,
} from './src/domain/api/EntityAdmission.ts';
export type { default as EntityAdmissionInventoryCertificate } from './src/domain/api/EntityAdmissionInventoryCertificate.ts';
export type { Receipt } from './src/domain/api/PublicReceipt.ts';
export type { RepairHint } from './src/domain/api/ReceiptSupport.ts';

export type { default as ContentAttachment } from './src/domain/api/ContentAttachment.ts';
export type { ContentOwnerDescriptor } from './src/domain/api/ContentOwner.ts';
