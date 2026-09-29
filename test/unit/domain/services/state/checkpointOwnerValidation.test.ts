import { expect, it } from 'vitest';
import { reconstructStateFromCheckpoint } from '../../../../../src/domain/services/state/checkpointLoad.ts';

it.each(['', 'node\0embedded', '\x01edge'])('rejects invalid checkpoint node owner %j', (node) => {
  expect(() => reconstructStateFromCheckpoint({
    nodes: [], edges: [], props: [{ node, key: 'value', value: 1 }],
  })).toThrow(expect.objectContaining({ code: 'E_CHECKPOINT_INVALID_PROP_OWNER' }));
});
