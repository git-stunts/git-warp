import WarpError from '../errors/WarpError.ts';
import EntityAdmissionInventoryCertificate from './EntityAdmissionInventoryCertificate.ts';
import ObservationReceipt from './ObservationReceipt.ts';

const INVENTORY_CERTIFICATES = new WeakMap<
  ObservationReceipt,
  EntityAdmissionInventoryCertificate
>();

export function bindEntityAdmissionInventoryCertificate(
  receipt: ObservationReceipt,
  certificate: EntityAdmissionInventoryCertificate,
): void {
  if (receipt.status !== 'completed') {
    throw certificateError('Only a completed Observation can carry an inventory certificate');
  }
  if (!(certificate instanceof EntityAdmissionInventoryCertificate)) {
    throw certificateError('Inventory certificate binding requires a certificate');
  }
  if (INVENTORY_CERTIFICATES.has(receipt)) {
    throw certificateError('Inventory certificate is already bound');
  }
  INVENTORY_CERTIFICATES.set(receipt, certificate);
}

/** Requires the terminal certificate from a fully consumed inventory receipt. */
export function requireEntityAdmissionInventoryCertificate(
  receipt: ObservationReceipt,
): EntityAdmissionInventoryCertificate {
  const certificate = findEntityAdmissionInventoryCertificate(receipt);
  if (certificate === null) {
    throw certificateError(
      'Observation Receipt has no complete entity admission inventory certificate',
    );
  }
  return certificate;
}

export function findEntityAdmissionInventoryCertificate(
  receipt: ObservationReceipt,
): EntityAdmissionInventoryCertificate | null {
  if (!(receipt instanceof ObservationReceipt)) {
    throw certificateError('Inventory certificate lookup requires an ObservationReceipt');
  }
  return INVENTORY_CERTIFICATES.get(receipt) ?? null;
}

function certificateError(message: string): WarpError {
  return new WarpError(message, 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE');
}
