/**
 * EffectPipeline — host-domain infrastructure for managed outbound
 * delivery.
 *
 * Orchestrates emission through sinks and collects delivery
 * observations. This is NOT substrate — it operates entirely
 * outside the graph. The graph provides effect entities (written by
 * participants); the pipeline externalizes them.
 *
 * @module EffectPipeline
 * @see docs/design/layer-boundary.md
 */

import { createEffectEmission, type EffectEmission } from '../types/EffectEmission.ts';
import type { ExternalizationPolicy } from '../types/ExternalizationPolicy.ts';
import type { DeliveryObservation } from '../types/DeliveryObservation.ts';
import type EffectSinkPort from '../../ports/EffectSinkPort.ts';

const NULL_COORDINATE: { frontier: Record<string, string> | null; ceiling: number | null } = {
  frontier: null,
  ceiling: null,
};

/**
 * Extracts the writer from emit options, defaulting to null.
 */
function resolveWriter(options?: { writer?: string | null }): string | null {
  return options?.writer ?? null;
}

/**
 * Normalizes a raw coordinate object, defaulting undefined fields to null.
 */
function normalizeCoordinate(coord: {
  frontier?: Record<string, string> | null;
  ceiling?: number | null;
}): { frontier: Record<string, string> | null; ceiling: number | null } {
  return {
    frontier: coord.frontier ?? null,
    ceiling: coord.ceiling ?? null,
  };
}

/**
 * Extracts the coordinate from emit options, defaulting to null frontier and ceiling.
 */
function resolveCoordinate(options?: {
  coordinate?: { frontier?: Record<string, string> | null; ceiling?: number | null };
}): { frontier: Record<string, string> | null; ceiling: number | null } {
  const coord = options?.coordinate ?? null;
  if (coord === null) {
    return NULL_COORDINATE;
  }
  return normalizeCoordinate(coord);
}

export class EffectPipeline {
  private _sink: EffectSinkPort;
  private _lens: Readonly<ExternalizationPolicy>;
  private _emissions: EffectEmission[];
  private _observations: DeliveryObservation[];

  /**
   * Constructs a pipeline bound to a delivery sink and an externalization lens.
   */
  constructor(options: {
    sink: EffectSinkPort;
    lens: Readonly<ExternalizationPolicy>;
  }) {
    this._sink = options.sink;
    this._lens = options.lens;
    this._emissions = [];
    this._observations = [];
  }

  /**
   * Returns the current externalization policy governing delivery behavior.
   */
  get lens(): Readonly<ExternalizationPolicy> {
    return this._lens;
  }

  /**
   * Replaces the externalization policy for subsequent deliveries.
   */
  set lens(newLens: Readonly<ExternalizationPolicy>) {
    this._lens = newLens;
  }

  /**
   * Returns a copy of the emission log.
   */
  get emissions(): ReadonlyArray<EffectEmission> {
    return [...this._emissions];
  }

  /**
   * Returns a copy of the observation log.
   */
  get observations(): ReadonlyArray<DeliveryObservation> {
    return [...this._observations];
  }

  /**
   * Emits an effect and delivers it through the configured sink.
   */
  async emit(
    kind: string,
    payload: unknown, // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    options?: {
      id: string;
      timestamp: number;
      writer?: string | null;
      coordinate?: { frontier?: Record<string, string> | null; ceiling?: number | null };
    },
  ): Promise<{ emission: EffectEmission; observations: DeliveryObservation | DeliveryObservation[] }> {
    const emission = createEffectEmission({
      id: options?.id ?? '',
      kind,
      payload,
      timestamp: options?.timestamp ?? 0,
      writer: resolveWriter(options),
      coordinate: resolveCoordinate(options),
    });

    this._emissions.push(emission);

    const observations = await this._sink.deliver(emission, this._lens);
    this._recordObservations(observations);

    return { emission, observations };
  }

  /**
   * Appends one or more delivery observations to the internal observation log.
   */
  private _recordObservations(observations: DeliveryObservation | DeliveryObservation[]): void {
    if (Array.isArray(observations)) {
      for (const obs of observations) {
        this._observations.push(obs);
      }
    } else {
      this._observations.push(observations);
    }
  }
}
