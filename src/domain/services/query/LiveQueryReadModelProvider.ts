import type NeighborProviderPort from '../../../ports/NeighborProviderPort.ts';
import QueryError from '../../errors/QueryError.ts';
import type WarpState from '../state/WarpState.ts';
import type {
  QueryReadModel,
  QueryReadModelOpenRequest,
  QueryReadModelProvider,
} from './QueryReadModelProvider.ts';
import StateQueryReadModel from './StateQueryReadModel.ts';

type BoundedReadModelProvider = (
  request: QueryReadModelOpenRequest,
) => Promise<QueryReadModel | null>;

type LiveQueryReadModelProviderParams = {
  readonly ensureFreshState: () => Promise<void>;
  readonly currentState: () => WarpState | null;
  readonly stateHash: (state: WarpState) => Promise<string>;
  readonly neighborProvider: () => NeighborProviderPort | null;
  readonly boundedReadModelProvider?: BoundedReadModelProvider;
};

export default class LiveQueryReadModelProvider implements QueryReadModelProvider {
  readonly #ensureFreshState: () => Promise<void>;
  readonly #currentState: () => WarpState | null;
  readonly #stateHash: (state: WarpState) => Promise<string>;
  readonly #neighborProvider: () => NeighborProviderPort | null;
  readonly #boundedReadModelProvider: BoundedReadModelProvider | null;

  constructor(params: LiveQueryReadModelProviderParams) {
    this.#ensureFreshState = params.ensureFreshState;
    this.#currentState = params.currentState;
    this.#stateHash = params.stateHash;
    this.#neighborProvider = params.neighborProvider;
    this.#boundedReadModelProvider = params.boundedReadModelProvider ?? null;
  }

  async openQueryReadModel(request?: QueryReadModelOpenRequest): Promise<QueryReadModel> {
    const bounded = await this.#openBoundedReadModel(request);
    if (bounded !== null) {
      return bounded;
    }
    await this.#ensureFreshState();
    const state = this.#currentState();
    const neighborProvider = this.#neighborProvider();
    if (state === null) {
      throw new QueryError('query read model source has no current state', {
        code: 'E_QUERY_READ_MODEL_STATE',
      });
    }
    return new StateQueryReadModel({
      state,
      stateHash: await this.#stateHash(state),
      visibility: { match: '*' },
      ...(neighborProvider !== null ? { neighborProvider } : {}),
    });
  }

  async #openBoundedReadModel(
    request: QueryReadModelOpenRequest | undefined,
  ): Promise<QueryReadModel | null> {
    if (request === undefined || this.#boundedReadModelProvider === null) {
      return null;
    }
    return await this.#boundedReadModelProvider(request);
  }
}
