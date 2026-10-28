import z from 'zod';
import ConeRecordError from '../../domain/errors/ConeRecordError.ts';
import ConeFrontier from '../../domain/services/cone/ConeFrontier.ts';
import ConeWriterPosition from '../../domain/services/cone/ConeWriterPosition.ts';
import type CodecPort from '../../ports/CodecPort.ts';

const FRONTIER_KIND = 'cone-frontier';
const FRONTIER_WIRE = z.object({
  kind: z.literal(FRONTIER_KIND),
  writers: z.array(z.tuple([z.string(), z.string(), z.number()])),
});

/** CBOR codec for the writer frontier a cone basis has folded. */
export default class ConeFrontierCborCodec {
  readonly #codec: CodecPort;

  constructor(codec: CodecPort) {
    this.#codec = codec;
  }

  encode(frontier: ConeFrontier): Uint8Array {
    const writers = frontier.entries().map(([writerId, position]) => [writerId, position.sha, position.lamport]);
    return this.#codec.encode({ kind: FRONTIER_KIND, writers });
  }

  decode(bytes: Uint8Array): ConeFrontier {
    const parsed = FRONTIER_WIRE.safeParse(this.#codec.decode<unknown>(bytes));
    if (!parsed.success) {
      throw new ConeRecordError('Stored cone frontier does not decode', { code: 'E_CONE_RECORD_CORRUPT' });
    }
    return new ConeFrontier(new Map(parsed.data.writers.map(([writerId, sha, lamport]) => [
      writerId, new ConeWriterPosition(sha, lamport),
    ])));
  }
}
