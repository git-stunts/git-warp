import WarpError from '../errors/WarpError.ts';
import JoinReceipt from './JoinReceipt.ts';

export type JoinResultOptions = {
  readonly receipt: JoinReceipt;
};

export default class JoinResult {
  readonly receipt: JoinReceipt;

  constructor(options: JoinResultOptions | null | undefined) {
    const fields = requireJoinResultOptions(options);
    if (!(fields.receipt instanceof JoinReceipt)) {
      throw new WarpError('JoinResult requires a JoinReceipt', 'E_JOIN_RESULT_RECEIPT');
    }
    this.receipt = fields.receipt;
    Object.freeze(this);
  }
}

function requireJoinResultOptions(options: JoinResultOptions | null | undefined): JoinResultOptions {
  if (options === null || options === undefined) {
    throw new WarpError('JoinResult options are required', 'E_JOIN_RESULT_OPTIONS');
  }
  return options;
}
