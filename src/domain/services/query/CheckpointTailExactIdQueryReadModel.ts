import type { SnapshotPropValue } from '../snapshot/SnapshotPropValue.ts';
import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import type ReadIdentity from '../optic/ReadIdentity.ts';
import type WorldlineOptic from '../optic/WorldlineOptic.ts';
import type {
  QueryNeighborEntry,
  QueryNeighborOptions,
  QueryNodeStreamRequest,
  QueryPropertyBag,
  QueryReadModel,
  QueryReadModelOpenRequest,
} from './QueryReadModelProvider.ts';
import type { QueryNodeSnapshot } from './QueryPlan.ts';

const PENDING_IDENTITY = 'checkpoint-tail-query:pending';

type CheckpointTailExactIdQueryReadModelOptions = {
  readonly nodeId: string;
  readonly optic: WorldlineOptic;
};

type ExactIdOnlyRequest = QueryReadModelOpenRequest & {
  readonly nodeRequest: QueryNodeStreamRequest & {
    readonly pattern: string;
    readonly select: readonly ['id'];
  };
};

export function exactIdOnlyQueryNodeId(request: QueryReadModelOpenRequest | undefined): string | null {
  if (!canUseExactIdOnlyProvider(request)) {
    return null;
  }
  const { nodeRequest } = request;
  if (!isExactIdPattern(nodeRequest.pattern) || !isIdOnlySelect(nodeRequest.select)) {
    return null;
  }
  return nodeRequest.pattern;
}

function canUseExactIdOnlyProvider(
  request: QueryReadModelOpenRequest | undefined,
): request is QueryReadModelOpenRequest {
  return request !== undefined
    && !request.aggregate
    && request.operations.length === 0;
}

function isExactIdPattern(pattern: string | readonly string[]): pattern is string {
  return typeof pattern === 'string' && !pattern.includes('*');
}

function isIdOnlySelect(select: readonly string[] | null): select is readonly ['id'] {
  return select?.length === 1 && select[0] === 'id';
}

export default class CheckpointTailExactIdQueryReadModel implements QueryReadModel {
  private readonly _nodeId: string;
  private readonly _optic: WorldlineOptic;
  private _readIdentity: string;

  constructor(options: CheckpointTailExactIdQueryReadModelOptions) {
    this._nodeId = options.nodeId;
    this._optic = options.optic;
    this._readIdentity = `${PENDING_IDENTITY}:${options.nodeId}`;
  }

  get stateHash(): string {
    return this._readIdentity;
  }

  async *nodes(request: QueryNodeStreamRequest): AsyncIterable<QueryNodeSnapshot> {
    if (!this._matchesRequest(request)) {
      return;
    }
    const node = await this._optic.node(this._nodeId).read();
    this._readIdentity = readIdentityStateHash(node.readIdentity);
    if (!node.alive) {
      return;
    }
    yield Object.freeze({
      id: this._nodeId,
      props: emptyProps(),
      edgesOut: Object.freeze([]),
      edgesIn: Object.freeze([]),
    });
  }

  async *neighbors(
    _nodeId: string,
    _options: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry> {}

  nodeProps(_nodeId: string): Promise<QueryPropertyBag | null> {
    return Promise.resolve(null);
  }

  private _matchesRequest(request: QueryNodeStreamRequest): request is ExactIdOnlyRequest['nodeRequest'] {
    return request.pattern === this._nodeId
      && request.select?.length === 1
      && request.select[0] === 'id';
  }
}

function emptyProps(): Readonly<{ [key: string]: SnapshotPropValue }> {
  return Object.freeze({});
}

function readIdentityStateHash(readIdentity: ReadIdentity): string {
  return `checkpoint-tail-query:${canonicalStringify(readIdentity)}`;
}
