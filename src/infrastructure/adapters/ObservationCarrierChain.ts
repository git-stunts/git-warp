import type ObservationCustodyIdentity from '../../domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationDigest from '../../domain/services/custody/ObservationDigest.ts';
import ObservationSupportFault from '../../domain/services/custody/ObservationSupportFault.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import type { GitPlumbing } from './gitErrorClassification.ts';
import ObservationCarrierMessage from './ObservationCarrierMessage.ts';
import { isObjectFault } from './ObservationObjectFault.ts';
import { isMissingObject, objectTypes } from './ObservationObjectTypes.ts';
import type ObservationWorkMeter from './ObservationWorkMeter.ts';

const HISTORY_DOMAIN = 'git-warp/observation-history';
const HASH_ALGORITHM = 'sha256';
const PARENT_HEADER = 'parent ';
const COMMIT_TYPE = 'commit';

export type ObservationCarrierHistory = {
  readonly plumbing: Pick<GitPlumbing, 'execute'>;
};

/** Where a retained carrier chain stands. */
export type ObservationChainPosition = {
  readonly tip: string | null;
  readonly sequence: number;
  readonly writers: number;
  readonly history: ObservationDigest;
};

type CommitParts = { readonly message: string; readonly parents: readonly string[] };

/** One carrier as read: its claim, its writer heads and the carrier before it. */
type ReadCarrier = {
  readonly message: ObservationCarrierMessage;
  readonly heads: readonly string[];
  readonly previous: string | null;
};

/**
 * Reads and checks carrier chains. Each carrier's claim is checked against its
 * predecessor's, from the tip back, so a walk holds one batch of heads in
 * memory however many writers the chain retains. It checks that the commits
 * the chain names exist; it does not walk their histories, which their parent
 * edges retain.
 */
export default class ObservationCarrierChain {
  readonly #history: ObservationCarrierHistory;
  readonly #crypto: CryptoPort;

  constructor(history: ObservationCarrierHistory, crypto: CryptoPort) {
    this.#history = history;
    this.#crypto = crypto;
    Object.freeze(this);
  }

  /** The position of a chain with no carriers yet. */
  async empty(): Promise<ObservationChainPosition> {
    return { tip: null, sequence: 0, writers: 0, history: await this.seed() };
  }

  async seed(): Promise<ObservationDigest> {
    return new ObservationDigest(await this.#crypto.hash(HASH_ALGORITHM, `${HISTORY_DOMAIN}\n`));
  }

  /** The rolling digest after one batch of writer heads. */
  async extend(previous: ObservationDigest, heads: readonly string[]): Promise<ObservationDigest> {
    return new ObservationDigest(await this.#crypto.hash(HASH_ALGORITHM, [previous.hex, ...heads, ''].join('\n')));
  }

  /** Verifies a whole chain belongs to this attempt and retains what its tip claims. */
  async walk(
    identity: ObservationCustodyIdentity,
    tip: string,
    meter: ObservationWorkMeter,
  ): Promise<ObservationChainPosition | ObservationSupportFault> {
    const first = await this.#read(identity, tip, meter);
    if (first instanceof ObservationSupportFault) {
      return first;
    }
    const fault = await this.#walkBack(identity, first, meter);
    return fault ?? { tip, sequence: first.message.sequence, writers: first.message.writers, history: first.message.history };
  }

  /** Checks each carrier against the one before it, holding one carrier at a time. */
  async #walkBack(identity: ObservationCustodyIdentity, tip: ReadCarrier, meter: ObservationWorkMeter): Promise<ObservationSupportFault | null> {
    let later = tip;
    while (later.previous !== null) {
      const earlier = await this.#read(identity, later.previous, meter);
      if (earlier instanceof ObservationSupportFault) {
        return earlier;
      }
      if (!await this.#follows(later, earlier.message)) {
        return new ObservationSupportFault('history-mismatch');
      }
      later = earlier;
    }
    return await this.#startsHonestly(later) ? null : new ObservationSupportFault('history-mismatch');
  }

  async #read(identity: ObservationCustodyIdentity, oid: string, meter: ObservationWorkMeter): Promise<ReadCarrier | ObservationSupportFault> {
    if (!meter.spend(1)) {
      return new ObservationSupportFault('work-limit');
    }
    const [type = ''] = await objectTypes(this.#history.plumbing, [oid]);
    if (isMissingObject(type)) {
      return new ObservationSupportFault('history-missing');
    }
    return type === COMMIT_TYPE ? await this.#parsed(identity, oid, meter) : new ObservationSupportFault('history-mismatch');
  }

  async #parsed(identity: ObservationCustodyIdentity, oid: string, meter: ObservationWorkMeter): Promise<ReadCarrier | ObservationSupportFault> {
    const info = await this.#commitOf(oid);
    if (info === null) {
      return new ObservationSupportFault('history-mismatch');
    }
    const message = ObservationCarrierMessage.parse(info.message);
    if (message === null || !message.binding.equals(identity.binding)) {
      return new ObservationSupportFault('history-mismatch');
    }
    return await this.#withHeads(carrierOf(message, info.parents), meter);
  }

  /** A corrupt object cannot be a carrier, so damage is a checkable fault; other failures surface. */
  async #commitOf(oid: string): Promise<CommitParts | null> {
    try {
      return commitParts(await this.#history.plumbing.execute({ args: ['cat-file', 'commit', oid] }));
    } catch (cause) {
      if (isObjectFault(cause)) {
        return null;
      }
      throw cause;
    }
  }

  async #withHeads(carrier: ReadCarrier, meter: ObservationWorkMeter): Promise<ReadCarrier | ObservationSupportFault> {
    if (!meter.spend(carrier.heads.length)) {
      return new ObservationSupportFault('work-limit');
    }
    return await this.#headsExist(carrier.heads) ? carrier : new ObservationSupportFault('history-missing');
  }

  async #headsExist(heads: readonly string[]): Promise<boolean> {
    return !(await objectTypes(this.#history.plumbing, heads)).some(isMissingObject);
  }

  /** True when `later` is exactly `earlier` plus its own heads. */
  async #follows(later: ReadCarrier, earlier: ObservationCarrierMessage): Promise<boolean> {
    const position = later.message.sequence === earlier.sequence + 1
      && later.message.writers === earlier.writers + later.heads.length;
    return position && (await this.extend(earlier.history, later.heads)).equals(later.message.history);
  }

  async #startsHonestly(first: ReadCarrier): Promise<boolean> {
    const position = first.message.sequence === 1 && first.message.writers === first.heads.length;
    return position && (await this.extend(await this.seed(), first.heads)).equals(first.message.history);
  }
}

/**
 * The parents and message of a raw commit object. Reading the object itself
 * keeps a missing parent a checkable fault: `git show` fails outright on one.
 */
function commitParts(raw: string): CommitParts {
  const separator = raw.indexOf('\n\n');
  const parents = raw.slice(0, separator).split('\n')
    .filter((line) => line.startsWith(PARENT_HEADER))
    .map((line) => line.slice(PARENT_HEADER.length));
  return { message: raw.slice(separator + 2), parents };
}

/** A carrier's first parent names its predecessor, except in the first carrier. */
function carrierOf(message: ObservationCarrierMessage, parents: readonly string[]): ReadCarrier {
  return message.sequence === 1
    ? { message, heads: parents, previous: null }
    : { message, heads: parents.slice(1), previous: parents[0] ?? null };
}
