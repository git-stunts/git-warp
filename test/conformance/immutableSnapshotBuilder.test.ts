import { describe, expect, it } from 'vitest';
import { Dot } from '../../src/domain/crdt/Dot.ts';
import VersionVector from '../../src/domain/crdt/VersionVector.ts';
import { LWWRegister } from '../../src/domain/crdt/LWW.ts';
import {
  createImmutableTickReceiptArraySnapshot,
  createImmutableWarpStateSnapshot,
} from '../../src/domain/services/ImmutableSnapshot.ts';
import WarpState from '../../src/domain/services/state/WarpState.ts';
import { createTickReceipt } from '../../src/domain/types/TickReceipt.ts';
import { EventId } from '../../src/domain/utils/EventId.ts';

class ConstructorGuardedValue {
  #secret: string;

  constructor(secret: string) {
    if (secret.length === 0) {
      throw new Error('secret required');
    }
    this.#secret = secret;
  }

  reveal(): string {
    return this.#secret;
  }
}

function testEvent(lamport: number, patchSha: string): EventId {
  return new EventId(lamport, 'writer-a', patchSha, 0);
}

function receiptArrayFixture(): ReturnType<typeof createTickReceipt>[] {
  return [
    createTickReceipt({
      patchSha: 'aaaa',
      writer: 'writer-a',
      lamport: 1,
      ops: [{ op: 'NodeAdd', target: 'node-a', result: 'applied' }],
    }),
  ];
}

describe('immutable snapshot builder contract', () => {
  it('rejects unsupported arbitrary class instances instead of descriptor-copying them', () => {
    const guarded = new ConstructorGuardedValue('secret');

    expect(guarded.reveal()).toBe('secret');
    expect(() => Reflect.apply(createImmutableWarpStateSnapshot, null, [guarded])).toThrow(/unsupported|snapshot|source/i);
  });

  it('keeps WarpState snapshots detached and read-only for public state returns', () => {
    const state = WarpState.empty();
    const key = 'node-a:name';
    state.nodeAlive.add('node-a', new Dot('writer-a', 1));
    state.mutatePropLWW(key, testEvent(1, 'aaaa'), 'blue');

    const snapshot = createImmutableWarpStateSnapshot(state);

    state.nodeAlive.add('node-b', new Dot('writer-a', 2));
    state.mutatePropLWW(key, testEvent(2, 'bbbb'), 'red');

    expect(snapshot).not.toBe(state);
    expect(snapshot.nodeAlive.contains('node-a')).toBe(true);
    expect(snapshot.nodeAlive.contains('node-b')).toBe(false);
    expect(snapshot.prop.get(key)?.value).toBe('blue');

    const nodeDots = snapshot.nodeAlive.getDots('node-a');
    expect(nodeDots).toEqual(['writer-a:1']);
    expect(() => Reflect.apply(Array.prototype.push, nodeDots, ['writer-a:3'])).toThrow();
    expect(snapshot.nodeAlive.getDots('node-a')).toEqual(['writer-a:1']);

    const propSet = Reflect.get(snapshot.prop, 'set');
    expect(typeof propSet).toBe('function');
    expect(() => Reflect.apply(
      propSet,
      snapshot.prop,
      ['node-b:name', LWWRegister.set(testEvent(3, 'cccc'), 'green')],
    )).toThrow(/read-only/i);
  });

  it('clones VersionVector through runtime behavior for supported WarpState snapshots', () => {
    const state = WarpState.empty();
    state.observedFrontier = VersionVector.from(new Map([['writer-a', 1]]));

    const snapshot = createImmutableWarpStateSnapshot(state);

    state.observedFrontier.set('writer-a', 2);

    expect(snapshot.observedFrontier).not.toBe(state.observedFrontier);
    expect(snapshot.observedFrontier.get('writer-a')).toBe(1);
    expect(Reflect.get(snapshot.observedFrontier, 'set')).toBeUndefined();
  });

  it('copies receipt arrays and rejects non-TickReceipt entries', () => {
    const receipts = receiptArrayFixture();
    const snapshot = createImmutableTickReceiptArraySnapshot(receipts);

    expect(snapshot).not.toBe(receipts);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => Object.defineProperty(snapshot, '1', { value: receipts[0] })).toThrow();
    expect(() => Reflect.apply(
      createImmutableTickReceiptArraySnapshot,
      null,
      [[receipts[0], new ConstructorGuardedValue('not-a-receipt')]],
    )).toThrow(/TickReceipt/i);
  });
});
