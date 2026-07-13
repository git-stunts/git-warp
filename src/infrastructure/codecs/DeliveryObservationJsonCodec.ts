import type { DeliveryObservation } from '../../domain/types/DeliveryObservation.ts';
import { sortedReplacer } from '../../domain/utils/canonicalStringify.ts';

export function canonicalObservationJson(observation: DeliveryObservation): string {
  return JSON.stringify(observation, sortedReplacer);
}
