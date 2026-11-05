import type WarpAccessPort from '../../../ports/WarpAccessPort.ts';
import type { AuthoredWriteReceipt } from '../../api/AuthoredWriteReceipt.ts';
import IntentSequence, { type WriteIntentInput } from '../../api/IntentSequence.ts';
import UnpublishedWriteReceipt from '../../api/UnpublishedWriteReceipt.ts';
import WarpAccessDenied from '../../api/WarpAccessDenied.ts';
import WarpWriteRequest from '../../api/WarpWriteRequest.ts';
import { WRITE_PURPOSE, type default as ConeWriteLowering } from './ConeWriteLowering.ts';
import type ConeWritePublisher from './ConeWritePublisher.ts';

/** One authored write: authorization before any read, then lowering, then the one publication. */
export default class ConeWriteExecutor {
  readonly #graph: string;
  readonly #access: WarpAccessPort;
  readonly #lowering: ConeWriteLowering;
  readonly #publisher: ConeWritePublisher;

  constructor(fields: {
    readonly graph: string;
    readonly access: WarpAccessPort;
    readonly lowering: ConeWriteLowering;
    readonly publisher: ConeWritePublisher;
  }) {
    this.#graph = fields.graph;
    this.#access = fields.access;
    this.#lowering = fields.lowering;
    this.#publisher = fields.publisher;
    Object.freeze(this);
  }

  async execute(writer: string, input: WriteIntentInput): Promise<AuthoredWriteReceipt> {
    const sequence = IntentSequence.from(input);
    const grant = await this.#access.authorizeWrite(new WarpWriteRequest({
      graph: this.#graph, writer, purpose: WRITE_PURPOSE, intents: sequence.intents,
    }));
    if (grant instanceof WarpAccessDenied) {
      return new UnpublishedWriteReceipt({ graph: this.#graph, writer, cause: `access-denied: ${grant.cause}` });
    }
    const lowered = await this.#lowering.lower({ writer, sequence, grant });
    return lowered instanceof UnpublishedWriteReceipt ? lowered : await this.#publisher.publish(lowered);
  }
}
