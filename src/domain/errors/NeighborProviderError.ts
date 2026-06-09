import WarpError, { type WarpErrorOptions } from './WarpError.ts';

export default class NeighborProviderError extends WarpError {
  static readonly E_INVALID_NEIGHBOR_ID = 'E_INVALID_NEIGHBOR_ID';
  static readonly E_INVALID_NEIGHBOR_LABEL = 'E_INVALID_NEIGHBOR_LABEL';

  constructor(message: string, options: WarpErrorOptions | null = {}) {
    super(message, 'E_NEIGHBOR_PROVIDER', options);
  }
}
