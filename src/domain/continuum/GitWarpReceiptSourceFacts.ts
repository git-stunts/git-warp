import { ReceiptShard } from '../artifacts/ReceiptShard.ts';
import WarpError from '../errors/WarpError.ts';
import { DeliveryObservation } from '../types/DeliveryObservation.ts';
import { TickReceipt } from '../types/TickReceipt.ts';

export type GitWarpReceiptSourceFactsFields = {
  readonly tickReceipt: TickReceipt;
  readonly deliveryObservations?: readonly DeliveryObservation[];
  readonly receiptShard?: ReceiptShard;
};

/** Local git-warp facts that can be projected into the Continuum receipt family. */
export default class GitWarpReceiptSourceFacts {
  readonly tickReceipt: TickReceipt;
  readonly deliveryObservations: readonly DeliveryObservation[];
  readonly receiptShard: ReceiptShard | undefined;

  constructor(fields: GitWarpReceiptSourceFactsFields) {
    this.tickReceipt = requireTickReceipt(fields.tickReceipt);
    requireReceiptOutcomes(this.tickReceipt);
    this.deliveryObservations = freezeDeliveryObservations(fields.deliveryObservations ?? []);
    this.receiptShard = optionalReceiptShard(fields.receiptShard);
    Object.freeze(this);
  }
}

/** Validates that the source fact is a concrete TickReceipt. */
function requireTickReceipt(value: TickReceipt): TickReceipt {
  if (!(value instanceof TickReceipt)) {
    throw new WarpError('tickReceipt must be a TickReceipt', 'E_VALIDATION');
  }
  return value;
}

/** Receipt-family projection needs at least one local operation outcome. */
function requireReceiptOutcomes(receipt: TickReceipt): void {
  if (receipt.ops.length === 0) {
    throw new WarpError('tickReceipt must contain at least one operation outcome', 'E_VALIDATION');
  }
}

/** Freezes and validates delivery observations. */
function freezeDeliveryObservations(values: readonly DeliveryObservation[]): readonly DeliveryObservation[] {
  const observations: DeliveryObservation[] = [];
  for (const value of values) {
    observations.push(requireDeliveryObservation(value));
  }
  return Object.freeze(observations);
}

/** Validates a delivery-observation carrier. */
function requireDeliveryObservation(value: DeliveryObservation): DeliveryObservation {
  if (!(value instanceof DeliveryObservation)) {
    throw new WarpError('deliveryObservations[] must be a DeliveryObservation', 'E_VALIDATION');
  }
  return value;
}

/** Validates an optional receipt-shard carrier. */
function optionalReceiptShard(value: ReceiptShard | undefined): ReceiptShard | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!(value instanceof ReceiptShard)) {
    throw new WarpError('receiptShard must be a ReceiptShard', 'E_VALIDATION');
  }
  return value;
}
