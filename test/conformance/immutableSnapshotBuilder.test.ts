import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import VersionVector from '../../src/domain/crdt/VersionVector.ts';
import { LWWRegister } from '../../src/domain/crdt/LWW.ts';
import { createImmutableValue, createImmutableWarpState } from '../../src/domain/services/ImmutableSnapshot.ts';
import WarpState from '../../src/domain/services/state/WarpState.ts';
import { createTickReceipt } from '../../src/domain/types/TickReceipt.ts';
import { EventId } from '../../src/domain/utils/EventId.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const IMMUTABLE_SNAPSHOT_PATH = 'src/domain/services/ImmutableSnapshot.ts';

type ForbiddenSourcePattern = {
  readonly label: string;
  readonly pattern: RegExp;
};

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

const FORBIDDEN_SOURCE_PATTERNS: readonly ForbiddenSourcePattern[] = [
  {
    label: 'generic object clone',
    pattern: /function\s+cloneImmutableObject\s*<\s*T\s*>\s*\(\s*value:\s*object/u,
  },
  {
    label: 'descriptor-copy allocation',
    pattern: /\bObject\.create\b/u,
  },
  {
    label: 'double-cast preservation',
    pattern: /\bas\s+unknown\s+as\s+T\b/u,
  },
  {
    label: 'generic public snapshot entry point',
    pattern: /createImmutableValue\s*<\s*T\s*>\s*\(\s*value:\s*T\s*\)\s*:\s*T/u,
  },
  {
    label: 'proxy returned as arbitrary T',
    pattern: /\bproxy\s+as\s+T\b/u,
  },
  {
    label: 'frozen clone returned as arbitrary T',
    pattern: /Object\.freeze\s*\(\s*cloned\s*\)\s+as\s+T\b/u,
  },
  {
    label: 'fallback arbitrary object clone',
    pattern: /return\s+cloneImmutableObject\s*\(\s*value\s*,\s*seen\s*\)/u,
  },
];

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
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
  it('removes generic clone/freeze source artifacts from ImmutableSnapshot', () => {
    const source = readRepoFile(IMMUTABLE_SNAPSHOT_PATH);

    for (const { label, pattern } of FORBIDDEN_SOURCE_PATTERNS) {
      expect(source, label).not.toMatch(pattern);
    }
  });

  it('rejects unsupported arbitrary class instances instead of descriptor-copying them', () => {
    const guarded = new ConstructorGuardedValue('secret');

    expect(guarded.reveal()).toBe('secret');
    expect(() => createImmutableValue(guarded)).toThrow(/unsupported|snapshot|source/i);
  });

  it('keeps WarpState snapshots detached and read-only for public state returns', () => {
    const state = WarpState.empty();
    const key = 'node-a:name';
    state.prop.set(key, LWWRegister.set(testEvent(1, 'aaaa'), 'blue'));

    const snapshot = createImmutableWarpState(state);

    state.prop.set(key, LWWRegister.set(testEvent(2, 'bbbb'), 'red'));

    expect(snapshot).not.toBe(state);
    expect(snapshot.prop.get(key)?.value).toBe('blue');
    expect(() => snapshot.prop.set('node-b:name', LWWRegister.set(testEvent(3, 'cccc'), 'green'))).toThrow(/read-only/i);
  });

  it('clones VersionVector through runtime behavior for supported WarpState snapshots', () => {
    const state = WarpState.empty();
    state.observedFrontier = VersionVector.from(new Map([['writer-a', 1]]));

    const snapshot = createImmutableWarpState(state);

    state.observedFrontier.set('writer-a', 2);

    expect(snapshot.observedFrontier).not.toBe(state.observedFrontier);
    expect(snapshot.observedFrontier.get('writer-a')).toBe(1);
    expect(() => snapshot.observedFrontier.set('writer-a', 3)).toThrow(/frozen/i);
  });

  it('copies receipt arrays and rejects non-TickReceipt entries', () => {
    const receipts = receiptArrayFixture();
    const snapshot = createImmutableValue(receipts);

    expect(snapshot).not.toBe(receipts);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => snapshot.push(receipts[0])).toThrow();
    expect(() => createImmutableValue([receipts[0], new ConstructorGuardedValue('not-a-receipt')])).toThrow(/TickReceipt/i);
  });
});
