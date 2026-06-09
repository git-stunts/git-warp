import { describe, expect, it } from 'vitest';
import type { Aperture } from '../../../../src/domain/types/Aperture.ts';
import type { WorldlineSource } from '../../../../src/domain/capabilities/QueryCapability.ts';
import Observer from '../../../../src/domain/services/query/Observer.ts';
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
import Worldline from '../../../../src/domain/services/Worldline.ts';

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

class WorldlineGraphFixture {
  constructor(private readonly observerResult: Observer) {}

  async observer(config: Aperture, options?: { source: WorldlineSource }): Promise<Observer>;
  async observer(name: string, config: Aperture, options?: { source: WorldlineSource }): Promise<Observer>;
  async observer(
    _configOrName: Aperture | string,
    _configOrOptions?: Aperture | { source: WorldlineSource },
    _options?: { source: WorldlineSource },
  ): Promise<Observer> {
    return this.observerResult;
  }
}

describe('Worldline', () => {
  it('forwards query read-model requests to the delegate fallback', async () => {
    const provider = new RecordingReadModelProvider();
    const delegate = new Observer({
      name: 'delegate',
      config: { match: '*' },
      readModelProvider: provider,
    });
    const worldline = new Worldline({ graph: new WorldlineGraphFixture(delegate) });
    const request: QueryReadModelOpenRequest = {
      nodeRequest: { pattern: 'node:a', select: ['id'] },
      operations: [],
      aggregate: false,
    };

    await worldline.openQueryReadModel(request);

    expect(provider.requests).toEqual([request]);
  });
});
