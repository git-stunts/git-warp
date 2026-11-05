import type WarpAccessPort from '../../../ports/WarpAccessPort.ts';
import type { AuthoredWriteReceipt } from '../../api/AuthoredWriteReceipt.ts';
import IntentSequence, { type WriteIntentInput } from '../../api/IntentSequence.ts';
import UnpublishedWriteReceipt from '../../api/UnpublishedWriteReceipt.ts';
import WarpAccessDenied from '../../api/WarpAccessDenied.ts';
import WarpWriteGrant from '../../api/WarpWriteGrant.ts';
import WarpWriteRequest from '../../api/WarpWriteRequest.ts';
import { WRITE_PURPOSE, type default as ConeWriteLowering } from './ConeWriteLowering.ts';
import type ConeWritePublisher from './ConeWritePublisher.ts';
import type ConeWriteRecovery from './ConeWriteRecovery.ts';

const UNRECOGNIZED_DECISION = 'the access boundary gave no grant';

/** One authored write: authorization before any read, then lowering, then the one publication. */
export default class ConeWriteExecutor {
  readonly #graph: string;
  readonly #access: WarpAccessPort;
  readonly #lowering: ConeWriteLowering;
  readonly #publisher: ConeWritePublisher;
  readonly #recovery: ConeWriteRecovery;

  constructor(fields: {
    readonly graph: string;
    readonly access: WarpAccessPort;
    readonly lowering: ConeWriteLowering;
    readonly publisher: ConeWritePublisher;
    readonly recovery: ConeWriteRecovery;
  }) {
    this.#graph = fields.graph;
    this.#access = fields.access;
    this.#lowering = fields.lowering;
    this.#publisher = fields.publisher;
    this.#recovery = fields.recovery;
    Object.freeze(this);
  }

  async execute(writer: string, input: WriteIntentInput): Promise<AuthoredWriteReceipt> {
    const sequence = IntentSequence.from(input);
    const request = new WarpWriteRequest({ graph: this.#graph, writer, purpose: WRITE_PURPOSE, intents: sequence.intents });
    const grant = await this.#access.authorizeWrite(request);
    if (!(grant instanceof WarpWriteGrant)) {
      return new UnpublishedWriteReceipt({ graph: this.#graph, writer, cause: accessDeniedCause(grant) });
    }
    const lowered = await this.#lowering.lower({ writer, sequence, grant });
    return lowered instanceof UnpublishedWriteReceipt ? lowered : await this.#publisher.publish(lowered, async () => await this.#revocation(request, grant));
  }

  /** Asks again after a writer's indeterminate write. A writer denied now learns nothing of it, as if no record remained. */
  async reconcile(writer: string, attempt: string): Promise<AuthoredWriteReceipt | null> {
    const request = new WarpWriteRequest({ graph: this.#graph, writer, purpose: WRITE_PURPOSE, intents: [] });
    const grant = await this.#access.authorizeWrite(request);
    return grant instanceof WarpWriteGrant ? await this.#recovery.reconcile(writer, attempt) : null;
  }

  /** Asks whether a writer may stage content, which writes objects before any intent exists. */
  async authorizeStage(writer: string, size: number): Promise<WarpAccessDenied | null> {
    const request = new WarpWriteRequest({ graph: this.#graph, writer, purpose: WRITE_PURPOSE, intents: [] });
    const grant = await this.#access.authorizeWrite(request);
    if (!(grant instanceof WarpWriteGrant)) {
      return grant instanceof WarpAccessDenied ? grant : new WarpAccessDenied(UNRECOGNIZED_DECISION);
    }
    return size > grant.budget.bytes ? new WarpAccessDenied('budget-exhausted') : null;
  }

  /**
   * Authority is checked again just before arming, not only at submission. A grant that changed
   * refuses too, since the retained premise binds the one this write was admitted under.
   */
  async #revocation(request: WarpWriteRequest, grant: WarpWriteGrant): Promise<string | null> {
    const current = await this.#access.authorizeWrite(request);
    if (!(current instanceof WarpWriteGrant)) {
      return accessDeniedCause(current);
    }
    return sameGrant(current, grant) ? null : 'authority-changed';
  }
}

function sameGrant(left: WarpWriteGrant, right: WarpWriteGrant): boolean {
  const budgets = left.budget.records === right.budget.records && left.budget.bytes === right.budget.bytes && left.budget.work === right.budget.work;
  return budgets && left.authority === right.authority;
}

/** Only a real grant authorizes. Anything else a port returns is a denial, whatever it claims. */
function accessDeniedCause(decision: WarpAccessDenied | WarpWriteGrant): string {
  return `access-denied: ${decision instanceof WarpAccessDenied ? decision.cause : UNRECOGNIZED_DECISION}`;
}
