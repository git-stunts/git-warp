import { expect, it, vi } from 'vitest';
import * as NodeIdModule from '../../../../src/domain/graph/NodeId.ts';
import NodeId from '../../../../src/domain/graph/NodeId.ts';
import { encodeEdgePropKey, tryDecodeEdgePropKey } from '../../../../src/domain/services/KeyCodec.ts';

it('returns null for an ordinary node property key', () => {
  expect(tryDecodeEdgePropKey('n\0k')).toBeNull();
});

it('rejects reserved endpoint identifiers even with a valid field count', () => {
  expect(tryDecodeEdgePropKey(encodeEdgePropKey('\x01bad', 'b', 'e', 'k'))).toBeNull();
});

it('does not hide unexpected constructor failures as malformed data', () => {
  const failure = new Error('unexpected constructor failure');
  class FailingNodeId extends NodeId {
    constructor(value: string) {
      super(value);
      throw failure;
    }
  }
  const constructor = vi.spyOn(NodeIdModule, 'default').mockImplementation(FailingNodeId);
  try {
    expect(() => tryDecodeEdgePropKey(encodeEdgePropKey('a', 'b', 'e', 'k'))).toThrow(failure);
  } finally {
    constructor.mockRestore();
  }
});
