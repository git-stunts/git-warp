import { Dot } from '../../../domain/crdt/Dot.ts';
import {
  _decDotWire,
  _encDotWire,
  type DotWire,
} from './generated/DotWire.generated.ts';
import { CodecError, Reader, Writer } from './WesleyLeBinaryRuntime.ts';

/**
 * Adapter that proves the Wesley-generated LE-binary boundary on `Dot`.
 *
 * This is a boundary pilot, not the final persistent Dot codec: Wesley's current
 * GraphQL `Int` lowering encodes `counter` as i32, while `Dot` itself does not
 * yet impose that upper bound.
 */
export class WesleyDotCodecAdapter {
  /**
   * Encodes a validated runtime `Dot` through the generated Wesley codec.
   */
  encode(dot: Dot): Uint8Array {
    if (!(dot instanceof Dot)) {
      throw new CodecError('WesleyDotCodecAdapter.encode requires a Dot');
    }
    const writer = new Writer();
    _encDotWire(writer, toWire(dot));
    return writer.finish();
  }

  /**
   * Decodes Wesley LE-binary bytes and constructs a validated runtime `Dot`.
   */
  decode(bytes: Uint8Array): Dot {
    const reader = new Reader(bytes);
    const wire = _decDotWire(reader);
    if (reader.remaining() > 0) {
      throw new CodecError('trailing bytes after decode');
    }
    return new Dot(wire.writerId, wire.counter);
  }
}

/**
 * Converts the runtime noun to the generated transport shape.
 */
function toWire(dot: Dot): DotWire {
  return {
    writerId: dot.writerId,
    counter: dot.counter,
  };
}
