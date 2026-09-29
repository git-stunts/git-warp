import { expect, it } from 'vitest';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import executeGC from '../../../../src/domain/services/executeGC.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { encodePropKey, encodeEdgePropKey, encodeEdgeKey } from '../../../../src/domain/services/KeyCodec.ts';

it('retains properties and lifecycle evidence while owner adds have not arrived', () => {
  const state = WarpState.empty();
  const event = new EventId(2, 'B', 'b'.repeat(40), 0);
  state.mutatePropLWW(encodePropKey('future', 'value'), event, 'pending');
  state.mutatePropLWW(encodeEdgePropKey('future', 'other', 'rel', 'value'), event, 'edge-pending');
  state.edgeBirthEvent.set(encodeEdgeKey('future', 'other', 'rel'), event);
  expect(executeGC(state, VersionVector.empty()).propertiesPruned).toBe(0);
  expect(state.propSize()).toBe(2);
  expect(state.edgeBirthEvent.size).toBe(1);
  state.nodeAlive.add('future', new Dot('A', 1));
  expect(state.attachmentRecords().map((record) => record.value)).toEqual(['pending']);
});
