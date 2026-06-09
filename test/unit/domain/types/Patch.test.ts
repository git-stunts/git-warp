import { describe, expect, it } from 'vitest';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import PatchError from '../../../../src/domain/errors/PatchError.ts';
import Patch from '../../../../src/domain/types/Patch.ts';

describe('Patch', () => {
  it('freezes a valid patch and copies mutable inputs', () => {
    const ops = [];
    const reads = ['node:a'];
    const writes = ['node:b'];
    const patch = new Patch({
      schema: 2,
      writer: 'writer-1',
      lamport: 1,
      context: { 'writer-0': 1 },
      ops,
      reads,
      writes,
    });

    reads.push('node:c');
    writes.push('node:d');

    expect(Object.isFrozen(patch)).toBe(true);
    expect(patch.context).toEqual({ 'writer-0': 1 });
    expect(patch.ops).toEqual([]);
    expect(patch.reads).toEqual(['node:a']);
    expect(patch.writes).toEqual(['node:b']);
  });

  it('clones VersionVector context input', () => {
    const context = VersionVector.empty();
    context.set('writer-1', 1);

    const patch = new Patch({
      schema: 2,
      writer: 'writer-1',
      lamport: 1,
      context,
      ops: [],
    });

    context.set('writer-1', 2);

    expect(patch.context).toBeInstanceOf(VersionVector);
    if (!(patch.context instanceof VersionVector)) {
      throw new Error('expected VersionVector context');
    }
    expect(patch.context.get('writer-1')).toBe(1);
  });

  it('rejects invalid schema, writer, lamport, and ops', () => {
    expect(() => new Patch({
      // @ts-expect-error exercising runtime validation.
      schema: 99,
      writer: 'writer-1',
      lamport: 1,
      context: {},
      ops: [],
    })).toThrow(PatchError);

    expect(() => new Patch({
      schema: 2,
      writer: '',
      lamport: 1,
      context: {},
      ops: [],
    })).toThrow(PatchError);

    expect(() => new Patch({
      schema: 2,
      writer: 'writer-1',
      lamport: -1,
      context: {},
      ops: [],
    })).toThrow(PatchError);

    expect(() => new Patch({
      schema: 2,
      writer: 'writer-1',
      lamport: 1,
      context: {},
      // @ts-expect-error exercising runtime validation.
      ops: null,
    })).toThrow(PatchError);
  });
});
