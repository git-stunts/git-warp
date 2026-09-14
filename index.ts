/**
 * @module
 *
 * Public v19 application boundary.
 *
 * Write intents. Observe lanes. Keep receipts.
 *
 * `Runtime` is the sole root runtime value. Generated SDKs provide validated
 * Intent and Observer values; formal optics and diagnostics remain on named
 * expert subpaths.
 */

export { default as Runtime } from './src/application/Runtime.ts';
export type {
  RuntimeForkOptions,
  RuntimeOpenOptions,
  RuntimeSettlementOptions,
  RuntimeStrandOptions,
} from './src/application/Runtime.ts';
export type { default as Evidence, EvidenceHandle } from './src/domain/api/Evidence.ts';
export type { default as Intent } from './src/domain/api/Intent.ts';
export type { WriteIntentInput } from './src/domain/api/IntentSequence.ts';
export type { default as Lane } from './src/domain/api/Lane.ts';
export type {
  CoordinateReference,
  LaneDescriptor,
  LaneKind,
  LaneReference,
} from './src/domain/api/Lane.ts';
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
export type { default as SettlementPreview } from './src/domain/api/SettlementPreview.ts';
export type { default as SettlementReceipt } from './src/domain/api/SettlementReceipt.ts';
export type { default as SettlementPlan } from './src/domain/settlement/SettlementPlan.ts';
export type { default as WriteReceipt } from './src/domain/api/WriteReceipt.ts';
export type {
  default as EntityOccurrence,
  EntityCausalRelation,
} from './src/domain/api/EntityOccurrence.ts';
export type {
  default as EntityAdmission,
  EntityAdmissionInitialProperties,
  EntityAdmissionOccurrenceReference,
  EntityAdmissionOrdering,
  EntityAdmissionOriginReading,
  EntityAdmissionRepresentationReference,
} from './src/domain/api/EntityAdmission.ts';
export type { default as EntityAdmissionInventoryCertificate } from './src/domain/api/EntityAdmissionInventoryCertificate.ts';
export type { AdmissionOutcome } from './src/domain/api/AdmissionOutcome.ts';
export type { Receipt } from './src/domain/api/PublicReceipt.ts';
export type { RepairHint } from './src/domain/api/ReceiptSupport.ts';
