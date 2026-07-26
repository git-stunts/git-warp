import { describe, expect, it } from 'vitest';

import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import {
  V18CheckpointMigrationCodec,
} from '../../../scripts/v18-to-v19/V18CheckpointMigrationCodec.ts';

describe('v18 checkpoint migration codec', () => {
  it('accepts a bounded monolithic artifact rejected by the runtime codec', () => {
    const encoded = defaultCodec.encode(new Uint8Array(6 * 1024 * 1024));

    expect(() => defaultCodec.decode(encoded)).toThrow('exceeds 5242880');
    expect(new V18CheckpointMigrationCodec().decode<Uint8Array>(encoded))
      .toHaveLength(6 * 1024 * 1024);
  });

  it('fails closed at its configured migration byte limit', () => {
    const codec = new V18CheckpointMigrationCodec({ maxDecodeBytes: 64 });
    const encoded = defaultCodec.encode(new Uint8Array(65));

    expect(() => codec.decode(encoded)).toThrow(
      'exceeds migration limit 64',
    );
  });
});
