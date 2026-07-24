import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type Evidence from './Evidence.ts';
import { freezeOptionalEvidence } from './EvidenceRuntime.ts';
import Observer from './Observer.ts';
import { freezeRepairHints, type RepairHint } from './ReceiptSupport.ts';

export type ObservationStatus = 'completed' | 'obstructed' | 'underdetermined';

type ObservationReceiptFields = {
  readonly lane: string;
  readonly observer: Observer;
  readonly repairHints?: readonly RepairHint[];
  readonly writer: string;
};

export type ObservationReceiptOptions = ObservationReceiptFields & (
  | {
      readonly evidence: Evidence;
      readonly reason?: never;
      readonly status: 'completed';
    }
  | {
      readonly evidence?: Evidence;
      readonly reason: string;
      readonly status: Exclude<ObservationStatus, 'completed'>;
    }
);

const OBSERVATION_STATUSES: ReadonlySet<ObservationStatus> = new Set([
  'completed',
  'obstructed',
  'underdetermined',
]);

export default class ObservationReceipt {
  readonly evidence: Evidence | undefined;
  readonly lane: string;
  readonly observer: Observer;
  readonly operation: 'observe' = 'observe';
  readonly reason: string | undefined;
  readonly repairHints: readonly RepairHint[];
  readonly status: ObservationStatus;
  readonly writer: string;

  constructor(options: ObservationReceiptOptions | null | undefined) {
    const fields = requireObservationReceiptOptions(options);
    validateObservationReceipt(fields);

    this.lane = fields.lane;
    this.writer = fields.writer;
    this.observer = fields.observer;
    this.status = fields.status;
    this.evidence = freezeOptionalEvidence(fields.evidence, 'observationReceipt.evidence');
    this.reason = fields.reason;
    this.repairHints = freezeRepairHints(fields.repairHints ?? []);
    Object.freeze(this);
  }
}

function validateObservationReceipt(options: ObservationReceiptOptions): void {
  requireNonEmptyString(options.lane, 'observationReceipt.lane');
  requireNonEmptyString(options.writer, 'observationReceipt.writer');
  validateObserver(options.observer);
  validateStatus(options.status);
  validateResolution(options);
}

function validateObserver(observer: Observer): void {
  if (!(observer instanceof Observer)) {
    throw new WarpError(
      'ObservationReceipt requires an Observer',
      'E_OBSERVATION_RECEIPT_OBSERVER',
    );
  }
}

function validateStatus(status: ObservationStatus): void {
  if (!OBSERVATION_STATUSES.has(status)) {
    throw new WarpError(
      'ObservationReceipt status is unsupported',
      'E_OBSERVATION_RECEIPT_STATUS',
    );
  }
}

function validateResolution(options: ObservationReceiptOptions): void {
  if (options.status === 'completed') {
    if (options.evidence === undefined) {
      throw new WarpError(
        'Completed ObservationReceipt requires evidence',
        'E_OBSERVATION_RECEIPT_EVIDENCE',
      );
    }
    if (options.reason !== undefined) {
      throw new WarpError(
        'Completed ObservationReceipt cannot carry a reason',
        'E_OBSERVATION_RECEIPT_REASON',
      );
    }
    return;
  }
  requireNonEmptyString(options.reason, 'observationReceipt.reason');
}

function requireObservationReceiptOptions(
  options: ObservationReceiptOptions | null | undefined,
): ObservationReceiptOptions {
  if (options === null || options === undefined) {
    throw new WarpError(
      'ObservationReceipt options are required',
      'E_OBSERVATION_RECEIPT_OPTIONS',
    );
  }
  return options;
}
