import type ObservationCustodyIdentity from '../../domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationSupportFault from '../../domain/services/custody/ObservationSupportFault.ts';
import type { GitPlumbing } from './gitErrorClassification.ts';
import ObservationCarrierMessage from './ObservationCarrierMessage.ts';
import { isObjectFault } from './ObservationObjectFault.ts';
import { isMissingObject, objectTypes } from './ObservationObjectTypes.ts';
import type ObservationWorkMeter from './ObservationWorkMeter.ts';

const PARENT_HEADER = 'parent ';
const COMMIT_TYPE = 'commit';

/** One carrier as read: its claim and the anchors it names. */
export type ReadCarrier = { readonly message: ObservationCarrierMessage; readonly parents: readonly string[] };

/**
 * Reads an attempt's history carrier (#1197): one commit whose message is this attempt's
 * claim and whose parents are frontier anchors. Whether those anchors and the heads they
 * retain are the ones the basis names is the caller's check.
 */
export default class ObservationCarrier {
  readonly #plumbing: Pick<GitPlumbing, 'execute'>;

  constructor(history: { readonly plumbing: Pick<GitPlumbing, 'execute'> }) {
    this.#plumbing = history.plumbing;
    Object.freeze(this);
  }

  /** The carrier at `oid` as this attempt's claim, or why it is not one. */
  async read(identity: ObservationCustodyIdentity, oid: string, meter: ObservationWorkMeter): Promise<ReadCarrier | ObservationSupportFault> {
    return meter.spend(1) ? await this.#readable(identity, oid) : new ObservationSupportFault('work-limit');
  }

  async #readable(identity: ObservationCustodyIdentity, oid: string): Promise<ReadCarrier | ObservationSupportFault> {
    const [type = ''] = await objectTypes(this.#plumbing, [oid]);
    if (isMissingObject(type)) {
      return new ObservationSupportFault('history-missing');
    }
    const carrier = type === COMMIT_TYPE ? await this.#claimed(identity, oid) : null;
    return carrier === null ? new ObservationSupportFault('history-mismatch') : carrier;
  }

  /** The commit's claim and parents, or null when it is not this attempt's carrier. */
  async #claimed(identity: ObservationCustodyIdentity, oid: string): Promise<ReadCarrier | null> {
    const commit = await this.#commitOf(oid);
    const message = commit === null ? null : ObservationCarrierMessage.parse(commit.message);
    return commit !== null && message !== null && message.binding.equals(identity.binding) ? { message, parents: commit.parents } : null;
  }

  /** A corrupt object cannot be a carrier, so damage is a checkable fault; other failures surface. */
  async #commitOf(oid: string): Promise<{ readonly message: string; readonly parents: readonly string[] } | null> {
    try {
      return commitParts(await this.#plumbing.execute({ args: ['cat-file', 'commit', oid] }));
    } catch (cause) {
      if (isObjectFault(cause)) {
        return null;
      }
      throw cause;
    }
  }
}

/**
 * The parents and message of a raw commit object. Reading the object itself keeps a
 * missing parent a checkable fault: `git show` fails outright on one.
 */
function commitParts(raw: string): { readonly message: string; readonly parents: readonly string[] } {
  const separator = raw.indexOf('\n\n');
  const parents = raw.slice(0, separator).split('\n')
    .filter((line) => line.startsWith(PARENT_HEADER))
    .map((line) => line.slice(PARENT_HEADER.length));
  return { message: raw.slice(separator + 2), parents };
}
