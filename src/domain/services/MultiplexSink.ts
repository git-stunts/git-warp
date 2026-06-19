/**
 * MultiplexSink — host-domain fan-out over multiple child sinks.
 *
 * Implements EffectSinkPort (composite pattern). This is host-domain
 * infrastructure, not substrate. Fan-out is driven by application
 * configuration, not by graph structure.
 *
 * @module MultiplexSink
 * @see docs/design/layer-boundary.md
 */

import EffectSinkPort from '../../ports/EffectSinkPort.ts';
import WarpError from '../errors/WarpError.ts';
import type { EffectEmission } from '../types/EffectEmission.ts';
import type { ExternalizationPolicy } from '../types/ExternalizationPolicy.ts';
import type { DeliveryObservation } from '../types/DeliveryObservation.ts';
import { requireDeliveryObservationBatch } from '../types/DeliveryObservationBatch.ts';

/** Default sink ID for MultiplexSink. */
const MULTIPLEX_SINK_ID = 'multiplex';

export class MultiplexSink extends EffectSinkPort {
  private readonly _id: string;
  private _sinks: EffectSinkPort[] = [];

  /**
   * Constructs a multiplex sink with an optional custom identifier.
   */
  constructor(options?: { id?: string }) {
    super();
    this._id =
      options !== undefined && options.id !== undefined && options.id !== ''
        ? options.id
        : MULTIPLEX_SINK_ID;
  }

  /** Returns the unique identifier for this multiplex sink. */
  get id(): string {
    return this._id;
  }

  /** Returns a shallow copy of the registered sinks. */
  get sinks(): readonly EffectSinkPort[] {
    return [...this._sinks];
  }

  /** Registers a child sink. Rejects duplicate IDs. */
  addSink(sink: EffectSinkPort): void {
    if (this._sinks.some((s) => s.id === sink.id)) {
      throw new WarpError(
        `duplicate sink id: ${sink.id}`,
        'E_MULTIPLEX_DUPLICATE_SINK',
        { context: { sinkId: sink.id } },
      );
    }
    this._sinks.push(sink);
  }

  /** Removes a child sink by ID. Returns true if removed, false if not found. */
  removeSink(sinkId: string): boolean {
    const before = this._sinks.length;
    this._sinks = this._sinks.filter((s) => s.id !== sinkId);
    return this._sinks.length < before;
  }

  /** Delivers an emission to all child sinks and collects observations. */
  async deliver(
    emission: EffectEmission,
    lens: ExternalizationPolicy,
  ): Promise<DeliveryObservation[]> {
    const observations: DeliveryObservation[] = [];
    for (const sink of this._sinks) {
      const childObservations = requireDeliveryObservationBatch(
        await sink.deliver(emission, lens),
        sink.id,
      );
      observations.push(...childObservations);
    }
    return observations;
  }
}
