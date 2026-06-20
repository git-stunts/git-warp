import { describe, it, expect } from 'vitest';
import EffectSinkPort from '../../../src/ports/EffectSinkPort.ts';
import { createEffectEmission, type EffectEmission } from '../../../src/domain/types/EffectEmission.ts';
import { LIVE_LENS, type ExternalizationPolicy } from '../../../src/domain/types/ExternalizationPolicy.ts';
import { createDeliveryObservation, type DeliveryObservation } from '../../../src/domain/types/DeliveryObservation.ts';

describe('EffectSinkPort', () => {
  it('abstract members are not callable on base prototype', () => {
    expect(EffectSinkPort.prototype.deliver).toBeUndefined();
    // id is an abstract getter — not on prototype
    expect(Object.getOwnPropertyDescriptor(EffectSinkPort.prototype, 'id')).toBeUndefined();
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestSink extends EffectSinkPort {
      get id() { return 'test-sink'; }
      async deliver(emission: EffectEmission, lens: ExternalizationPolicy): Promise<DeliveryObservation[]> {
        return [createDeliveryObservation({
          emissionId: emission.id,
          sinkId: this.id,
          outcome: 'delivered',
          timestamp: 0,
          lens,
        })];
      }
    }
    const sink = new TestSink();
    const observations = await sink.deliver(
      createEffectEmission({
        id: 'emission-1',
        kind: 'test',
        payload: null,
        timestamp: 0,
        writer: null,
        coordinate: { frontier: null, ceiling: null },
      }),
      LIVE_LENS,
    );

    expect(sink).toBeInstanceOf(EffectSinkPort);
    expect(sink.id).toBe('test-sink');
    expect(observations[0]?.outcome).toBe('delivered');
  });
});
