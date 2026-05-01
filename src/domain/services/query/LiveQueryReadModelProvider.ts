import type NeighborProviderPort from '../../../ports/NeighborProviderPort.ts';
import QueryError from '../../errors/QueryError.ts';
import type WarpState from '../state/WarpState.ts';
import type {
  QueryReadModel,
  QueryReadModelProvider,
} from './QueryReadModelProvider.ts';
import StateQueryReadModel from './StateQueryReadModel.ts';

type LiveQueryReadModelProviderParams = {
  readonly ensureFreshState: () => Promise<void>;
  readonly currentState: () => WarpState | null;
  readonly stateHash: (state: WarpState) => Promise<string>;
  readonly neighborProvider: () => NeighborProviderPort | null;
};

export default class LiveQueryReadModelProvider implements QueryReadModelProvider {
  readonly #ensureFreshState: () => Promise<void>;
  readonly #currentState: () => WarpState | null;
  readonly #stateHash: (state: WarpState) => Promise<string>;
  readonly #neighborProvider: () => NeighborProviderPort | null;

  constructor(params: LiveQueryReadModelProviderParams) {
    this.#ensureFreshState = params.ensureFreshState;
    this.#currentState = params.currentState;
    this.#stateHash = params.stateHash;
    this.#neighborProvider = params.neighborProvider;
  }

  async openQueryReadModel(): Promise<QueryReadModel> {
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
}
