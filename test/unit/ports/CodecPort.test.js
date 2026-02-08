import { describe, it, expect } from 'vitest';
import CodecPort from '../../../src/ports/CodecPort.js';
import { CborCodec } from '../../../src/infrastructure/codecs/CborCodec.js';
import { encode, decode } from '../../../src/infrastructure/codecs/CborCodec.js';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.js';

describe('CodecPort', () => {
  it('throws on direct call to encode()', () => {
    const port = new CodecPort();
    expect(() => port.encode({ key: 'value' })).toThrow('not implemented');
  });

  it('throws on direct call to decode()', () => {
    const port = new CodecPort();
    expect(() => port.decode(Buffer.from([]))).toThrow('not implemented');
  });
});

describe('CborCodec extends CodecPort', () => {
  it('CborCodec instanceof CodecPort is true', () => {
    const codec = new CborCodec();
    expect(codec).toBeInstanceOf(CodecPort);
  });

  it('default export is instanceof CodecPort', () => {
    expect(defaultCodec).toBeInstanceOf(CodecPort);
  });

  it('class encode/decode round-trip', () => {
    const codec = new CborCodec();
    const data = { foo: 'bar', count: 42, nested: { a: [1, 2, 3] } };
    const encoded = codec.encode(data);
    const decoded = codec.decode(encoded);
    expect(decoded).toEqual(data);
  });

  it('named function exports still work', () => {
    const data = { z: 1, a: 2, m: 3 };
    const encoded = encode(data);
    const decoded = decode(encoded);
    expect(decoded).toEqual(data);
  });

  it('deterministic encoding via class matches function', () => {
    const codec = new CborCodec();
    const data = { z: 1, a: 2 };
    const fromClass = codec.encode(data);
    const fromFn = encode(data);
    expect(Buffer.compare(fromClass, fromFn)).toBe(0);
  });
});
