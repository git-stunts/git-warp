import { describe, expect, it } from 'vitest';
import type { Aperture } from '../../../../src/domain/types/Aperture.ts';
import type { WorldlineSource } from '../../../../src/domain/capabilities/QueryCapability.ts';
import Observer, { type ObserverBacking } from '../../../../src/domain/services/query/Observer.ts';
import BoundedSupportRule from '../../../../src/domain/services/query/BoundedSupportRule.ts';
import CausalIndexPlan from '../../../../src/domain/services/query/CausalIndexPlan.ts';
import SupportFragmentPlan from '../../../../src/domain/services/query/SupportFragmentPlan.ts';
import type {
  QueryNeighborEntry,
  QueryNeighborOptions,
  QueryNodeStreamRequest,
  QueryPropertyBag,
  QueryReadModel,
  QueryReadModelOpenRequest,
  QueryReadModelProvider,
} from '../../../../src/domain/services/query/QueryReadModelProvider.ts';
import type { QueryNodeSnapshot } from '../../../../src/domain/services/query/QueryPlan.ts';
import type { SnapshotPropValue } from '../../../../src/domain/services/snapshot/SnapshotPropValue.ts';
import ProjectionHandle from '../../../../src/domain/services/ProjectionHandle.ts';

class EmptyQueryReadModel implements QueryReadModel {
  readonly stateHash = 'empty';

  async *nodes(_request: QueryNodeStreamRequest): AsyncIterable<QueryNodeSnapshot> {}

  async *neighbors(
    _nodeId: string,
    _options: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry> {}

  async nodeProps(_nodeId: string): Promise<QueryPropertyBag | null> {
    return null;
  }
}

class RecordingReadModelProvider implements QueryReadModelProvider {
  readonly requests: (QueryReadModelOpenRequest | undefined)[] = [];
  private readonly readModel = new EmptyQueryReadModel();

  async openQueryReadModel(request?: QueryReadModelOpenRequest): Promise<QueryReadModel> {
    this.requests.push(request);
    return this.readModel;
  }
}

class ProjectionGraphFixture {
  readonly observerRequests: ObserverRequest[] = [];

  constructor(private readonly observerResult: Observer) {}

  async observer(config: Aperture, options?: { source: WorldlineSource }): Promise<Observer>;
  async observer(name: string, config: Aperture, options?: { source: WorldlineSource }): Promise<Observer>;
  async observer(
    configOrName: Aperture | string,
    configOrOptions?: Aperture | { source: WorldlineSource },
    options?: { source: WorldlineSource },
  ): Promise<Observer> {
    this.observerRequests.push(normalizeObserverRequest(configOrName, configOrOptions, options));
    return this.observerResult;
  }
}

type VisibleNodeProps = Readonly<{ [key: string]: SnapshotPropValue }>;

class ReadableObserverBacking implements ObserverBacking {
  readonly nodeProps: VisibleNodeProps = Object.freeze({ status: 'ready' });
  hasNodeCalls = 0;
  getNodePropsCalls = 0;

  async hasNode(_nodeId: string): Promise<boolean> {
    this.hasNodeCalls += 1;
    return true;
  }

  async getNodes(): Promise<string[]> {
    return ['node:a'];
  }

  async getNodeProps(_nodeId: string): Promise<VisibleNodeProps> {
    this.getNodePropsCalls += 1;
    return this.nodeProps;
  }

  async getEdges(): Promise<[]> {
    return [];
  }

  async observer(
    name: string,
    config: Aperture,
    options: { source: WorldlineSource },
  ): Promise<Observer> {
    return new Observer({
      name,
      config,
      graph: this,
      source: options.source,
    });
  }
}

type ObserverRequest = {
  readonly name: string | null;
  readonly config: Aperture;
  readonly source: WorldlineSource | null;
};

function normalizeObserverRequest(
  configOrName: Aperture | string,
  configOrOptions?: Aperture | { source: WorldlineSource },
  options?: { source: WorldlineSource },
): ObserverRequest {
  if (typeof configOrName === 'string') {
    return Object.freeze({
      name: configOrName,
      config: requireAperture(configOrOptions),
      source: options?.source ?? null,
    });
  }
  return Object.freeze({
    name: null,
    config: configOrName,
    source: sourceFromOptions(configOrOptions),
  });
}

function sourceFromOptions(
  value: Aperture | { source: WorldlineSource } | undefined,
): WorldlineSource | null {
  if (value !== undefined && 'source' in value) {
    return value.source;
  }
  return null;
}

function requireAperture(value: Aperture | { source: WorldlineSource } | undefined): Aperture {
  if (value !== undefined && 'match' in value) {
    return value;
  }
  throw new ProjectionHandleTestError('expected observer aperture');
}

class ProjectionHandleTestError extends Error {}

describe('ProjectionHandle', () => {
  it('forwards query read-model requests to the delegate fallback', async () => {
    const provider = new RecordingReadModelProvider();
    const delegate = new Observer({
      name: 'delegate',
      config: { match: '*' },
      readModelProvider: provider,
    });
    const worldline = new ProjectionHandle({ graph: new ProjectionGraphFixture(delegate) });
    const supportRule = BoundedSupportRule.entityRead({
      surface: 'query',
      nodeIds: ['node:a'],
    });
    const causalIndexPlan = CausalIndexPlan.fromSupportRule(supportRule);
    const request: QueryReadModelOpenRequest = {
      nodeRequest: { pattern: 'node:a', select: ['id'] },
      operations: [],
      aggregate: false,
      supportRule,
      causalIndexPlan,
      supportFragmentPlan: SupportFragmentPlan.fromSupportAndIndex({
        supportRule,
        causalIndexPlan,
      }),
    };

    await worldline.openQueryReadModel(request);

    expect(provider.requests).toEqual([request]);
  });

  it('opens delegate observers through the injected graph with the selected source', async () => {
    const delegate = new Observer({
      name: 'delegate',
      config: { match: '*' },
      readModelProvider: new RecordingReadModelProvider(),
    });
    const graph = new ProjectionGraphFixture(delegate);
    const source: WorldlineSource = {
      kind: 'coordinate',
      frontier: { 'writer-a': 'a'.repeat(40) },
      ceiling: 7,
      checkpointSha: 'b'.repeat(40),
    };
    const worldline = new ProjectionHandle({ graph, source });

    await worldline.observer('coordinate-reader', { match: 'node:*' });

    expect(graph.observerRequests).toEqual([
      {
        name: 'coordinate-reader',
        config: { match: 'node:*' },
        source: {
          kind: 'coordinate',
          frontier: new Map([['writer-a', 'a'.repeat(40)]]),
          ceiling: 7,
          checkpointSha: 'b'.repeat(40),
        },
      },
    ]);
  });

  it('caches the direct read delegate for repeated node reads', async () => {
    const backing = new ReadableObserverBacking();
    const delegate = new Observer({
      name: 'delegate',
      config: { match: '*' },
      graph: backing,
      source: { kind: 'live' },
    });
    const graph = new ProjectionGraphFixture(delegate);
    const worldline = new ProjectionHandle({
      graph,
      source: { kind: 'strand', strandId: 'review-lane', ceiling: 3 },
    });

    await expect(worldline.hasNode('node:a')).resolves.toBe(true);
    await expect(worldline.getNodeProps('node:a')).resolves.toEqual({ status: 'ready' });

    expect(graph.observerRequests).toEqual([
      {
        name: null,
        config: { match: '*' },
        source: { kind: 'strand', strandId: 'review-lane', ceiling: 3 },
      },
    ]);
    expect(backing.hasNodeCalls).toBe(1);
    expect(backing.getNodePropsCalls).toBe(1);
  });
});
