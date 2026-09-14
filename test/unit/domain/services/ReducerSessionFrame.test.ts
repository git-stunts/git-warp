import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { LWWRegister } from '../../../../src/domain/crdt/LWW.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import TrieGeometry from '../../../../src/domain/orset/trie/TrieGeometry.ts';
import StateSession from '../../../../src/domain/orset/session/StateSession.ts';
import PatchError from '../../../../src/domain/errors/PatchError.ts';
import { encodePropKey } from '../../../../src/domain/services/KeyCodec.ts';
import cborCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { InMemoryTrieStore } from '../../../helpers/trieHelpers.ts';

const GEOMETRY = TrieGeometry.default16way();

async function openSession(): Promise<StateSession> {
  return await StateSession.open({
    nodeAliveRootOid: null,
    edgeAliveRootOid: null,
    store: new InMemoryTrieStore(),
    codec: cborCodec,
    geometry: GEOMETRY,
  });
}

async function loadFrame() {
  const { ReducerSessionFrame } = await import(
    '../../../../src/domain/services/JoinReducerSession.ts'
  );
  return ReducerSessionFrame;
}

/**
 * Presents deliberately wrong field shapes to the frame constructor.
 *
 * These guards defend a runtime boundary — decoded state, a JavaScript
 * consumer — that the compiler cannot see through, so the wrong shape has to
 * reach the constructor unchecked to prove the guard fires. One cast, named
 * and confined here rather than spread across the cases.
 */
function malformedFields(fields: Readonly<Record<string, unknown>>): ReducerSessionFrameFields {
  return fields as unknown as ReducerSessionFrameFields;
}

type ReducerSessionFrameFields = Readonly<{
  session: StateSession;
  prop: Map<string, LWWRegister<string>>;
  observedFrontier: VersionVector;
  edgeBirthEvent: Map<string, never>;
}>;

function wellFormedFields(session: StateSession) {
  return {
    session,
    prop: new Map<string, LWWRegister<string>>(),
    observedFrontier: VersionVector.empty(),
    edgeBirthEvent: new Map<string, never>(),
  };
}

describe('ReducerSessionFrame construction', () => {
  it('accepts well-formed fields and freezes the result', async () => {
    const ReducerSessionFrame = await loadFrame();
    const session = await openSession();

    const frame = new ReducerSessionFrame(wellFormedFields(session));

    expect(Object.isFrozen(frame)).toBe(true);
    expect(frame.session).toBe(session);
    expect(frame.propSize()).toBe(0);
  });

  it('rejects a session that is not a StateSession', async () => {
    const ReducerSessionFrame = await loadFrame();
    const session = await openSession();
    const fields = malformedFields({ ...wellFormedFields(session), session: { addNode: () => undefined } });

    expect(() => new ReducerSessionFrame(fields)).toThrow(PatchError);
    expect(() => new ReducerSessionFrame(fields)).toThrow(/requires a StateSession/u);
  });

  it('rejects a prop container that is not a Map', async () => {
    const ReducerSessionFrame = await loadFrame();
    const session = await openSession();
    const fields = malformedFields({ ...wellFormedFields(session), prop: Object.create(null) });

    expect(() => new ReducerSessionFrame(fields)).toThrow(/requires a prop Map/u);
  });

  it('rejects an observed frontier that is a plain Map rather than a VersionVector', async () => {
    const ReducerSessionFrame = await loadFrame();
    const session = await openSession();
    const fields = malformedFields({ ...wellFormedFields(session), observedFrontier: new Map() });

    expect(() => new ReducerSessionFrame(fields)).toThrow(/requires a VersionVector/u);
  });

  it('rejects an edge birth container that is not a Map', async () => {
    const ReducerSessionFrame = await loadFrame();
    const session = await openSession();
    const fields = malformedFields({ ...wellFormedFields(session), edgeBirthEvent: [] });

    expect(() => new ReducerSessionFrame(fields)).toThrow(/requires an edgeBirthEvent Map/u);
  });
});

describe('ReducerSessionFrame property accessors', () => {
  it('reads back a seeded property register by its encoded key', async () => {
    const ReducerSessionFrame = await loadFrame();
    const session = await openSession();
    const key = encodePropKey('node:one', 'title');
    const register = new LWWRegister(
      { lamport: 1, writerId: 'writer-a', patchSha: 'patch-a', opIndex: 0 },
      'first',
    );

    const frame = new ReducerSessionFrame({
      ...wellFormedFields(session),
      prop: new Map([[key, register]]),
    });

    expect(frame.propSize()).toBe(1);
    expect(frame.hasProp(key)).toBe(true);
    expect(frame.getEncodedProp(key)?.value).toBe('first');
  });

  it('reports absence for a key that was never seeded', async () => {
    const ReducerSessionFrame = await loadFrame();
    const session = await openSession();
    const frame = new ReducerSessionFrame(wellFormedFields(session));

    expect(frame.hasProp(encodePropKey('node:missing', 'title'))).toBe(false);
    expect(frame.getEncodedProp(encodePropKey('node:missing', 'title'))).toBeUndefined();
  });

  it('carries an observed frontier through unchanged', async () => {
    const ReducerSessionFrame = await loadFrame();
    const session = await openSession();
    const frontier = VersionVector.from(new Map([['writer-a', 7]]));

    const frame = new ReducerSessionFrame({
      ...wellFormedFields(session),
      observedFrontier: frontier,
    });

    expect(frame.observedFrontier).toBe(frontier);
  });

  it('keeps a seeded edge birth event addressable', async () => {
    const ReducerSessionFrame = await loadFrame();
    const session = await openSession();
    const born = { lamport: 4, writerId: 'writer-b', patchSha: 'patch-b', opIndex: 2 };

    const frame = new ReducerSessionFrame({
      ...wellFormedFields(session),
      edgeBirthEvent: new Map([['edge:key', born]]),
    });

    expect(frame.edgeBirthEvent.get('edge:key')).toStrictEqual(born);
    expect(new Dot('writer-b', 1).writerId).toBe('writer-b');
  });
});
