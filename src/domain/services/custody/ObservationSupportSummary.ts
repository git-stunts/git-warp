import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import ObservationDigest from './ObservationDigest.ts';
import { isObjectId } from './ObservationObjectId.ts';

/**
 * What an attempt's retained edges must correspond to: counts, ordered digests
 * and its dependency pages in order, because custody does not keep support order.
 */
export default class ObservationSupportSummary {
  readonly writers: number;
  readonly history: ObservationDigest;
  readonly dependencies: number;
  readonly dependency: ObservationDigest;
  readonly pages: readonly string[];

  constructor(options: {
    readonly writers: number;
    readonly history: ObservationDigest;
    readonly dependencies: number;
    readonly dependency: ObservationDigest;
    readonly pages: readonly string[];
  }) {
    if (!isValidSummary(options)) {
      throw new ObservationCustodyError('Observation support summary needs counts, digests and page ids');
    }
    this.writers = options.writers;
    this.history = options.history;
    this.dependencies = options.dependencies;
    this.dependency = options.dependency;
    this.pages = Object.freeze([...options.pages]);
    Object.freeze(this);
  }
}

function isValidSummary(options: ConstructorParameters<typeof ObservationSupportSummary>[0]): boolean {
  const counts = isCount(options.writers) && isCount(options.dependencies);
  const digests = options.history instanceof ObservationDigest && options.dependency instanceof ObservationDigest;
  return counts && digests && options.pages.every(isObjectId);
}

function isCount(count: number): boolean {
  return Number.isSafeInteger(count) && count >= 0;
}
