/**
 * ConsoleEffectSink — logs effect emissions to a logger.
 *
 * Suppresses output during replay/inspect (when suppressExternal is true).
 *
 * @module ConsoleEffectSink
 */

import EffectSinkPort from '../../ports/EffectSinkPort.ts';
import { createDeliveryObservation, type DeliveryObservation } from '../../domain/types/DeliveryObservation.ts';
import type { EffectEmission } from '../../domain/types/EffectEmission.ts';
import {
  OUTCOME_DELIVERED,
  OUTCOME_SUPPRESSED,
  type ExternalizationPolicy,
} from '../../domain/types/ExternalizationPolicy.ts';

/** Default sink ID for ConsoleEffectSink. */
const CONSOLE_SINK_ID = 'console';

function buildSuppressedObservation(sinkId: string, emission: EffectEmission, lens: ExternalizationPolicy): DeliveryObservation {
  return createDeliveryObservation({
    emissionId: emission.id,
    sinkId,
    outcome: OUTCOME_SUPPRESSED,
    reason: `suppressed by ${lens.mode} lens`,
    timestamp: Date.now(),
    lens,
  });
}

function resolveSinkId(options?: { id?: string }): string {
  if (options !== null && options !== undefined && typeof options.id === 'string' && options.id.length > 0) {
    return options.id;
  }
  return CONSOLE_SINK_ID;
}

function resolveLogger(options?: { logger?: { info: (...args: unknown[]) => void } }): { info: (...args: unknown[]) => void } | null {
  if (options !== null && options !== undefined && options.logger !== undefined) {
    return options.logger;
  }
  return null;
}

export class ConsoleEffectSink extends EffectSinkPort {
  private readonly _id: string;
  private readonly _logger: { info: (...args: unknown[]) => void } | null;

  constructor(options?: { logger?: { info: (...args: unknown[]) => void }; id?: string }) {
    super();
    this._id = resolveSinkId(options);
    this._logger = resolveLogger(options);
  }

  get id(): string {
    return this._id;
  }

  deliver(emission: EffectEmission, lens: ExternalizationPolicy): Promise<DeliveryObservation> {
    if (lens.suppressExternal) {
      return Promise.resolve(buildSuppressedObservation(this._id, emission, lens));
    }

    if (this._logger !== null) {
      this._logger.info(`[effect:${emission.kind}]`, emission.id, emission.payload);
    }

    return Promise.resolve(
      createDeliveryObservation({
        emissionId: emission.id,
        sinkId: this._id,
        outcome: OUTCOME_DELIVERED,
        timestamp: Date.now(),
        lens,
      }),
    );
  }
}
