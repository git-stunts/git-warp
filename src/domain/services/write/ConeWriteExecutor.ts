import type WarpAccessPort from '../../../ports/WarpAccessPort.ts';
import type { AuthoredWriteReceipt } from '../../api/AuthoredWriteReceipt.ts';
import IntentSequence, { type WriteIntentInput } from '../../api/IntentSequence.ts';
import UnpublishedWriteReceipt from '../../api/UnpublishedWriteReceipt.ts';
import WarpAccessDenied from '../../api/WarpAccessDenied.ts';
import WarpWriteRequest from '../../api/WarpWriteRequest.ts';
import { WRITE_PURPOSE, type default as ConeWriteLowering } from './ConeWriteLowering.ts';
import type ConeWritePublisher from './ConeWritePublisher.ts';
import type ConeWriteRecovery from './ConeWriteRecovery.ts';

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
    if (grant instanceof WarpAccessDenied) {
      return new UnpublishedWriteReceipt({ graph: this.#graph, writer, cause: accessDeniedCause(grant) });
    }
    const lowered = await this.#lowering.lower({ writer, sequence, grant });
    return lowered instanceof UnpublishedWriteReceipt ? lowered : await this.#publisher.publish(lowered, async () => await this.#revocation(request));
  }

  /** Asks again after a writer's indeterminate write. A writer denied now learns nothing of it, as if no record remained. */
  async reconcile(writer: string, attempt: string): Promise<AuthoredWriteReceipt | null> {
    const request = new WarpWriteRequest({ graph: this.#graph, writer, purpose: WRITE_PURPOSE, intents: [] });
    const grant = await this.#access.authorizeWrite(request);
    return grant instanceof WarpAccessDenied ? null : await this.#recovery.reconcile(writer, attempt);
  }

  /** Authority is current at publication, not merely at submission. */
  async #revocation(request: WarpWriteRequest): Promise<string | null> {
    const current = await this.#access.authorizeWrite(request);
    return current instanceof WarpAccessDenied ? accessDeniedCause(current) : null;
  }
}

function accessDeniedCause(denied: WarpAccessDenied): string {
  return `access-denied: ${denied.cause}`;
}
