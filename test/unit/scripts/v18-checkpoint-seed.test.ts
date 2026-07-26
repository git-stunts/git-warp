import { describe, expect, it } from 'vitest';

import { encodePropKey } from '../../../src/domain/services/KeyCodec.ts';
import WarpState from '../../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../../src/domain/utils/EventId.ts';
import {
  translateV18CheckpointFrontier,
  translateV18CheckpointState,
} from '../../../scripts/v18-to-v19/V18CheckpointSeed.ts';

describe('v18 checkpoint seed translation', () => {
  it('rewrites content handles without changing CRDT event identity', () => {
    const state = WarpState.empty();
    const contentEvent = new EventId(7, 'alice', 'a'.repeat(40), 1);
    const titleEvent = new EventId(8, 'alice', 'b'.repeat(40), 2);
    const contentKey = encodePropKey('doc:one', '_content');
    const titleKey = encodePropKey('doc:one', 'title');
    state.mutatePropLWW(contentKey, contentEvent, 'c'.repeat(40));
    state.mutatePropLWW(titleKey, titleEvent, 'Retained title');

    const translated = translateV18CheckpointState(
      state,
      (reference) => `asset:translated:${reference}`,
    );

    expect(translated.getEncodedProp(contentKey)).toEqual({
      eventId: contentEvent,
      value: `asset:translated:${'c'.repeat(40)}`,
    });
    expect(translated.getEncodedProp(contentKey)?.eventId).toBe(contentEvent);
    expect(translated.getEncodedProp(titleKey)).toBe(state.getEncodedProp(titleKey));
    expect(state.getEncodedProp(contentKey)?.value).toBe('c'.repeat(40));
  });

  it('fails closed when retained content is not a string reference', () => {
    const state = WarpState.empty();
    state.mutatePropLWW(
      encodePropKey('doc:one', '_content'),
      new EventId(1, 'alice', 'a'.repeat(40), 0),
      42,
    );

    expect(() => translateV18CheckpointState(state, (reference) => reference))
      .toThrow('is not a string reference');
  });

  it('maps every retained frontier commit and rejects history gaps', () => {
    const oldSha = 'a'.repeat(40);
    const newSha = 'b'.repeat(40);

    expect(translateV18CheckpointFrontier(
      new Map([['alice', oldSha]]),
      new Map([[oldSha, newSha]]),
    )).toEqual(new Map([['alice', newSha]]));
    expect(() => translateV18CheckpointFrontier(
      new Map([['alice', 'c'.repeat(40)]]),
      new Map([[oldSha, newSha]]),
    )).toThrow('is outside rewritten writer history');
  });
});
