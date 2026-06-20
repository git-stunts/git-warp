import { describe, expect, it } from 'vitest';

import Observer, {
  type ObserverBacking,
  type ObserverConfig,
} from '../../../../../src/domain/services/query/Observer.ts';
import ObserverAccumulation from '../../../../../src/domain/services/query/ObserverAccumulation.ts';
import ObserverBasis from '../../../../../src/domain/services/query/ObserverBasis.ts';
import ObserverEmission from '../../../../../src/domain/services/query/ObserverEmission.ts';
import ObserverPlan from '../../../../../src/domain/services/query/ObserverPlan.ts';
import ObserverReadingEnvelope from '../../../../../src/domain/services/query/ObserverReadingEnvelope.ts';
import type { WorldlineSource } from '../../../../../src/domain/capabilities/QueryCapability.ts';

type ObserverCall = {
  readonly name: string;
  readonly config: ObserverConfig;
  readonly source: WorldlineSource;
};

class StructuralObserverBacking implements ObserverBacking {
  readonly seekCalls: ObserverCall[] = [];

  hasNode(nodeId: string): Promise<boolean> {
    return Promise.resolve(nodeId === 'task:a' || nodeId === 'task:c');
  }

  getNodes(): Promise<string[]> {
    return Promise.resolve(['task:a', 'note:b', 'task:c']);
  }

  getNodeProps(nodeId: string): Promise<{ readonly [key: string]: string } | null> {
    if (nodeId === 'task:a') {
      return Promise.resolve({ status: 'open', owner: 'ada', secret: 'hidden' });
    }
    if (nodeId === 'task:c') {
      return Promise.resolve({ status: 'done' });
    }
    return Promise.resolve(null);
  }

  getEdges(): Promise<Array<{
    readonly from: string;
    readonly to: string;
    readonly label: string;
    readonly props: { readonly [key: string]: string };
  }>> {
    return Promise.resolve([
      { from: 'task:a', to: 'task:c', label: 'blocks', props: { status: 'active' } },
      { from: 'task:a', to: 'note:b', label: 'mentions', props: { status: 'ignored' } },
    ]);
  }

  observer(
    name: string,
    config: ObserverConfig,
    options: { source: WorldlineSource },
  ): Promise<Observer> {
    this.seekCalls.push({ name, config, source: options.source });
    return Promise.resolve(new Observer({
      name,
      config,
      graph: this,
      source: options.source,
    }));
  }
}

describe('Observer structural surface', () => {
  it('exposes a native basis and preserves it through seek()', async () => {
    const backing = new StructuralObserverBacking();
    const observer = new Observer({
      name: 'structural',
      config: {
        match: 'task:*',
        expose: ['status'],
        basis: ['status', 'owner'],
      },
      graph: backing,
    });

    expect(observer.basis).toBeInstanceOf(ObserverBasis);
    expect(observer.basis.distinctions).toEqual(['status', 'owner']);
    expect(Object.isFrozen(observer.basis)).toBe(true);

    await observer.seek();

    expect(backing.seekCalls).toEqual([
      {
        name: 'structural',
        config: {
          match: 'task:*',
          expose: ['status'],
          basis: ['status', 'owner'],
        },
        source: { kind: 'live' },
      },
    ]);
  });

  it('accumulates visible observer state and emits a deterministic summary', async () => {
    const backing = new StructuralObserverBacking();
    const observer = new Observer({
      name: 'structural',
      config: {
        match: 'task:*',
        expose: ['status'],
        basis: ['status', 'owner'],
      },
      graph: backing,
    });

    const accumulation = await observer.accumulate();
    const emission = accumulation.emit();

    expect(accumulation).toBeInstanceOf(ObserverAccumulation);
    expect(accumulation.nodeCount).toBe(2);
    expect(accumulation.edgeCount).toBe(1);
    expect(accumulation.propertyKeys).toEqual(['status']);
    expect(Object.isFrozen(accumulation.propertyKeys)).toBe(true);

    expect(emission).toBeInstanceOf(ObserverEmission);
    expect(emission).toEqual(new ObserverEmission({
      basis: ['status', 'owner'],
      nodeCount: 2,
      edgeCount: 1,
      propertyKeys: ['status'],
      matchedBasis: ['status'],
    }));
    await expect(observer.emit()).resolves.toEqual(emission);
  });

  it('emits one reading envelope family from the observer plan and payload', async () => {
    const observer = new Observer({
      name: 'structural',
      config: {
        match: 'task:*',
        expose: ['status'],
        basis: ['status', 'owner'],
      },
      graph: new StructuralObserverBacking(),
    });

    const plan = observer.plan();
    const envelope = await observer.readingEnvelope({
      witnessRef: 'witness:observer-structural',
      shellRef: 'shell:observer-structural',
      pluralityRef: 'plurality:status-owner',
    });

    expect(plan).toBeInstanceOf(ObserverPlan);
    expect(plan.name).toBe('structural');
    expect(plan.source).toEqual({ kind: 'live' });
    expect(plan.toConfig()).toEqual({
      match: 'task:*',
      expose: ['status'],
      basis: ['status', 'owner'],
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.expose)).toBe(true);

    expect(envelope).toBeInstanceOf(ObserverReadingEnvelope);
    expect(envelope.plan).toEqual(plan);
    expect(envelope.payload).toEqual(new ObserverEmission({
      basis: ['status', 'owner'],
      nodeCount: 2,
      edgeCount: 1,
      propertyKeys: ['status'],
      matchedBasis: ['status'],
    }));
    expect(envelope.budget).toEqual({
      nodeCount: 2,
      edgeCount: 1,
      propertyKeyCount: 1,
      matchedBasisCount: 1,
    });
    expect(envelope.residualBasis).toEqual(['owner']);
    expect(envelope.hasResidual()).toBe(true);
    expect(envelope.hasPlurality()).toBe(true);
    expect(envelope.source).toEqual({ kind: 'live' });
    expect(envelope.witnessRef).toBe('witness:observer-structural');
    expect(envelope.shellRef).toBe('shell:observer-structural');
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.budget)).toBe(true);
    expect(Object.isFrozen(envelope.residualBasis)).toBe(true);
  });

  it('rejects invalid basis distinctions at construction time', () => {
    expect(() => new Observer({
      name: 'invalid',
      config: { match: '*', basis: ['status', ''] },
      graph: new StructuralObserverBacking(),
    })).toThrow('observer basis distinction must be non-empty');
  });

  it('rejects invalid observer plans and reading envelopes', () => {
    const basis = new ObserverBasis(['status']);
    const payload = new ObserverEmission({
      basis: ['status'],
      nodeCount: 1,
      edgeCount: 0,
      propertyKeys: ['status'],
      matchedBasis: ['status'],
    });

    expect(() => new ObserverPlan({
      name: '',
      match: '*',
      basis,
      source: { kind: 'live' },
    })).toThrow('observer plan field must be a non-empty string');

    expect(() => new ObserverPlan({
      name: 'invalid',
      match: [],
      basis,
      source: { kind: 'live' },
    })).toThrow('observer plan match must be a string or non-empty string array');

    expect(() => new ObserverReadingEnvelope({
      plan: new ObserverPlan({
        name: 'valid',
        match: '*',
        basis,
        source: { kind: 'live' },
      }),
      payload,
      witnessRef: '',
    })).toThrow('observer reading envelope refs must be non-empty when provided');

    expect(() => new ObserverReadingEnvelope({
      // @ts-expect-error runtime guard for JavaScript callers
      plan: payload,
      payload,
    })).toThrow('observer reading envelope requires an ObserverPlan');
  });
});
