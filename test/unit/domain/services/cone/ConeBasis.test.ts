import { describe, expect, it } from 'vitest';
import PatchEntry from '../../../../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import ConeContendedObstruction from '../../../../../src/domain/services/cone/ConeContendedObstruction.ts';
import ConeFolded from '../../../../../src/domain/services/cone/ConeFolded.ts';
import ConeFrontier from '../../../../../src/domain/services/cone/ConeFrontier.ts';
import ConeRoot from '../../../../../src/domain/services/cone/ConeRoot.ts';
import ConeSharedDotObstruction from '../../../../../src/domain/services/cone/ConeSharedDotObstruction.ts';
import ConeWriterDivergedObstruction from '../../../../../src/domain/services/cone/ConeWriterDivergedObstruction.ts';
import ConeWriterPatches from '../../../../../src/domain/services/cone/ConeWriterPatches.ts';
import ConeWriterPosition from '../../../../../src/domain/services/cone/ConeWriterPosition.ts';
import StoredConeBasis from '../../../../../src/domain/services/cone/StoredConeBasis.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

function untyped<T>(json: string): T {
  const value: T = JSON.parse(json);
  return value;
}

describe('ConeRoot', () => {
  it('distinguishes the empty trie from a stored revision', () => {
    expect(ConeRoot.empty().isEmpty()).toBe(true);
    expect(ConeRoot.empty().toString()).toBe('(empty)');
    expect(() => ConeRoot.empty().revision()).toThrow('has no revision');
    const root = ConeRoot.at('abcd1234');
    expect(root.isEmpty()).toBe(false);
    expect(root.revision()).toBe('abcd1234');
    expect(root.toString()).toBe('abcd1234');
    expect(root.equals(ConeRoot.at('abcd1234'))).toBe(true);
    expect(root.equals(ConeRoot.empty())).toBe(false);
    expect(() => ConeRoot.at('XYZ')).toThrow('lowercase hex object id');
  });
});

describe('ConeWriterPosition and ConeFrontier', () => {
  it('validates positions', () => {
    expect(new ConeWriterPosition(SHA_A, 3).equals(new ConeWriterPosition(SHA_A, 3))).toBe(true);
    expect(new ConeWriterPosition(SHA_A, 3).equals(new ConeWriterPosition(SHA_A, 4))).toBe(false);
    expect(new ConeWriterPosition(SHA_A, 3).equals(new ConeWriterPosition(SHA_B, 3))).toBe(false);
    expect(() => new ConeWriterPosition('abc', 1)).toThrow('needs a commit sha');
    expect(() => new ConeWriterPosition(SHA_A, -1)).toThrow('non-negative safe integer');
  });

  it('advances writers immutably and keeps writer-id order', () => {
    const frontier = ConeFrontier.empty()
      .advanced('w2', new ConeWriterPosition(SHA_B, 2))
      .advanced('w1', new ConeWriterPosition(SHA_A, 1));
    expect(frontier.entries().map(([writerId]) => writerId)).toEqual(['w1', 'w2']);
    expect(frontier.position('w1')?.sha).toBe(SHA_A);
    expect(frontier.position('w9')).toBeNull();
    expect(ConeFrontier.empty().position('w1')).toBeNull();
    expect(frontier.equals(new ConeFrontier(new Map(frontier.entries())))).toBe(true);
    expect(frontier.equals(ConeFrontier.empty())).toBe(false);
    expect(frontier.equals(frontier.advanced('w1', new ConeWriterPosition(SHA_B, 5)))).toBe(false);
  });

  it('rejects malformed frontiers', () => {
    expect(() => new ConeFrontier(untyped('{}'))).toThrow('must be a Map');
    expect(() => new ConeFrontier(new Map([['bad writer', new ConeWriterPosition(SHA_A, 1)]]))).toThrow();
    expect(() => new ConeFrontier(new Map([['w1', untyped<ConeWriterPosition>('{}')]]))).toThrow('must be writer positions');
  });
});

describe('ConeBasis and StoredConeBasis', () => {
  it('pairs a root with a frontier', () => {
    const basis = new ConeBasis(ConeRoot.at(SHA_A), ConeFrontier.empty().advanced('w1', new ConeWriterPosition(SHA_B, 1)));
    expect(basis.equals(new ConeBasis(ConeRoot.at(SHA_A), basis.frontier))).toBe(true);
    expect(basis.equals(ConeBasis.empty())).toBe(false);
    expect(basis.equals(new ConeBasis(ConeRoot.at(SHA_A), ConeFrontier.empty()))).toBe(false);
    expect(ConeBasis.empty().root.isEmpty()).toBe(true);
    expect(() => new ConeBasis(untyped('{}'), ConeFrontier.empty())).toThrow('needs a root and a frontier');
    expect(() => new ConeBasis(ConeRoot.empty(), untyped('{}'))).toThrow('needs a root and a frontier');
  });

  it('binds a stored basis to its head revision', () => {
    expect(new StoredConeBasis(ConeBasis.empty(), SHA_A).revision).toBe(SHA_A);
    expect(() => new StoredConeBasis(ConeBasis.empty(), 'nope')).toThrow('needs a basis and a head revision');
    expect(() => new StoredConeBasis(untyped('{}'), SHA_A)).toThrow('needs a basis and a head revision');
  });
});

describe('cone obstructions and fold evidence', () => {
  it('describes each obstruction with its repair', () => {
    const shared = new ConeSharedDotObstruction({ set: 'node', dot: new Dot('w1', 4), elements: ['b', 'a'], patchSha: SHA_A });
    expect(shared.code).toBe('E_CONE_SHARED_DOT');
    expect(shared.elements).toEqual(['a', 'b']);
    expect(shared.describe()).toContain('node dot w1:4');
    expect(shared.describe()).toContain('repair the duplicate dot');
    const diverged = new ConeWriterDivergedObstruction({ writerId: 'w1', foldedSha: null, tipSha: SHA_B });
    expect(diverged.code).toBe('E_CONE_WRITER_DIVERGED');
    expect(diverged.describe()).toContain('(none)');
    expect(new ConeWriterDivergedObstruction({ writerId: 'w1', foldedSha: SHA_A, tipSha: SHA_B }).describe()).toContain(SHA_A);
    const contended = new ConeContendedObstruction('lane', 4);
    expect(contended.code).toBe('E_CONE_CONTENDED');
    expect(contended.describe()).toContain('4 attempts');
    expect(new ConeFolded(SHA_A, 3).changedRecords).toBe(3);
  });

  it('requires writer patches to belong to their writer', () => {
    const entry = new PatchEntry({
      patch: new Patch({ writer: 'w1', lamport: 1, context: {}, ops: [new NodeAdd('n', new Dot('w1', 1))] }), sha: SHA_A,
    });
    expect(new ConeWriterPatches('w1', [entry]).entries).toHaveLength(1);
    expect(() => new ConeWriterPatches('w2', [entry])).toThrow('must all belong to their writer');
  });
});
