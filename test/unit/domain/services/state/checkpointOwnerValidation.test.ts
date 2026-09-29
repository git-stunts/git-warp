import { expect, it } from 'vitest';
import { reconstructStateFromCheckpoint } from '../../../../../src/domain/services/state/checkpointLoad.ts';

it.each(['', 'node\0embedded', '\x01edge'])('rejects invalid checkpoint node owner %j', (node) => {
  expect(() => reconstructStateFromCheckpoint({
    nodes: [], edges: [], props: [{ node, key: 'value', value: 1 }],
  })).toThrow(expect.objectContaining({ code: 'E_CHECKPOINT_INVALID_PROP_OWNER' }));
});

it('rejects checkpoint property values outside the runtime value model', () => {
  expect(() => reconstructStateFromCheckpoint({
    nodes: ['n'], edges: [], props: [{ node: 'n', key: 'value', value: undefined }],
  })).toThrow(expect.objectContaining({ code: 'E_CHECKPOINT_INVALID_PROP_VALUE' }));
});

it('does not fabricate birth evidence absent from a visible checkpoint', () => {
  const state = reconstructStateFromCheckpoint({
    nodes: ['a', 'b'], edges: [{ from: 'a', to: 'b', label: 'e' }], props: [],
  });
  expect(state.edgeBirthEvent.size).toBe(0);
});
