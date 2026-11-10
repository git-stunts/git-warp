import { blake3 } from '@noble/hashes/blake3.js';
import { describe, expect, it } from 'vitest';
import ManifestCommitment from '../../../../src/domain/retained/ManifestCommitment.ts';
import { hexEncode, textEncode } from '../../../../src/domain/utils/bytes.ts';

describe('ManifestCommitment field-count boundary (#815)', () => {
  it('hashes more fields than a JavaScript call can receive as arguments', () => {
    const count = 65_536;
    const fields = Array.from({ length: count }, () => 'a');
    // Independent preimage from the schema: each one-byte field is exactly "1:a".
    const expected = hexEncode(blake3(textEncode('1:a'.repeat(count))));
    expect(() => ManifestCommitment.over(fields)).not.toThrow();
    expect(ManifestCommitment.over(fields).toString()).toBe(expected);
  });
});
