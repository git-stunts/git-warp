import type { DeliveryObservation } from '../../domain/types/DeliveryObservation.ts';
import type { EffectEmission } from '../../domain/types/EffectEmission.ts';
import type { TickReceipt } from '../../domain/types/TickReceipt.ts';
import { sortedReplacer } from '../../domain/utils/canonicalStringify.ts';

export function tickReceiptCanonicalJson(receipt: TickReceipt): string {
  return JSON.stringify(receipt, sortedReplacer);
}

export function canonicalEmissionJson(emission: EffectEmission): string {
  return JSON.stringify(emission, sortedReplacer);
}

export function canonicalObservationJson(observation: DeliveryObservation): string {
  return JSON.stringify(observation, sortedReplacer);
}
