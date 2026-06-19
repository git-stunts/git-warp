import WarpError from '../errors/WarpError.ts';
import { DeliveryObservation } from './DeliveryObservation.ts';

export const EFFECT_SINK_INVALID_OBSERVATION_BATCH =
  'E_EFFECT_SINK_INVALID_OBSERVATION_BATCH';
export const EFFECT_SINK_INVALID_OBSERVATION =
  'E_EFFECT_SINK_INVALID_OBSERVATION';

export function requireDeliveryObservationBatch(
  observations: DeliveryObservation[],
  sinkId: string,
): DeliveryObservation[] {
  if (!Array.isArray(observations)) {
    throw new WarpError(
      `Effect sink ${sinkId} must return DeliveryObservation[]`,
      EFFECT_SINK_INVALID_OBSERVATION_BATCH,
      { context: { sinkId } },
    );
  }
  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index];
    if (!(observation instanceof DeliveryObservation)) {
      throw new WarpError(
        `Effect sink ${sinkId} returned a non-DeliveryObservation at index ${String(index)}`,
        EFFECT_SINK_INVALID_OBSERVATION,
        { context: { sinkId, index } },
      );
    }
  }
  return observations;
}
