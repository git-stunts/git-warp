import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import GitWarpTickPatchReplayCore from '../../../../src/domain/continuum/GitWarpTickPatchReplayCore.ts';
import GitWarpTickReceiptShell from '../../../../src/domain/continuum/GitWarpTickReceiptShell.ts';
import GitWarpTickReceiptWitnessCore from '../../../../src/domain/continuum/GitWarpTickReceiptWitnessCore.ts';
import GitWarpTickWitnessLadder from '../../../../src/domain/continuum/GitWarpTickWitnessLadder.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import { TickReceipt } from '../../../../src/domain/types/TickReceipt.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';

const PATCH_SHA = 'e'.repeat(40);
const WRITER_ID = 'writer-a';
const LAMPORT = 7;

function makePatch(): Patch {
  const context = VersionVector.empty();
  context.set('writer-prior', 4);
  return new Patch({
    schema: 3,
    writer: WRITER_ID,
    lamport: LAMPORT,
    context,
    ops: [new NodeAdd('node:a', new Dot(WRITER_ID, LAMPORT))],
    reads: ['node:read'],
    writes: ['node:a'],
  });
}

function makeReceipt(fields: {
  readonly patchSha?: string;
  readonly writer?: string;
  readonly lamport?: number;
} = {}): TickReceipt {
  return new TickReceipt({
    patchSha: fields.patchSha ?? PATCH_SHA,
    writer: fields.writer ?? WRITER_ID,
    lamport: fields.lamport ?? LAMPORT,
    ops: [
      {
        op: 'NodeAdd',
        target: 'node:a',
        result: 'applied',
        reason: 'node admitted',
      },
      {
        op: 'PropSet',
        target: 'node:a\x00name',
        result: 'redundant',
      },
    ],
  });
}

describe('GitWarpTickWitnessLadder', () => {
  it('splits patch replay core, receipt witness core, and receipt shell facts', () => {
    const ladder = new GitWarpTickWitnessLadder({
      patch: makePatch(),
      patchSha: PATCH_SHA,
      receipt: makeReceipt(),
    });

    expect(ladder.replayCore).toBeInstanceOf(GitWarpTickPatchReplayCore);
    expect(ladder.replayCore.patchSha).toBe(PATCH_SHA);
    expect(ladder.replayCore.writer).toBe(WRITER_ID);
    expect(ladder.replayCore.lamport).toBe(LAMPORT);
    expect(ladder.replayCore.operationCount).toBe(1);
    expect(ladder.replayCore.contextWriterCount).toBe(1);
    expect(ladder.replayCore.readCount).toBe(1);
    expect(ladder.replayCore.writeCount).toBe(1);

    expect(ladder.witnessCore).toBeInstanceOf(GitWarpTickReceiptWitnessCore);
    expect(ladder.witnessCore.outcomeCount).toBe(2);
    expect(ladder.witnessCore.appliedCount).toBe(1);
    expect(ladder.witnessCore.supersededCount).toBe(0);
    expect(ladder.witnessCore.redundantCount).toBe(1);

    expect(ladder.receiptShell).toBeInstanceOf(GitWarpTickReceiptShell);
    expect(ladder.receiptShell.outcomeCount).toBe(2);
    expect(ladder.receiptShell.reasonCount).toBe(1);
    expect(ladder.receiptShell.hasExplanatoryReasons()).toBe(true);
  });

  it('rejects patch and receipt values that do not describe the same tick', () => {
    const patch = makePatch();

    expect(() => new GitWarpTickWitnessLadder({
      patch,
      patchSha: PATCH_SHA,
      receipt: makeReceipt({ patchSha: 'f'.repeat(40) }),
    })).toThrow(WarpError);

    expect(() => new GitWarpTickWitnessLadder({
      patch,
      patchSha: PATCH_SHA,
      receipt: makeReceipt({ writer: 'writer-b' }),
    })).toThrow(WarpError);

    expect(() => new GitWarpTickWitnessLadder({
      patch,
      patchSha: PATCH_SHA,
      receipt: makeReceipt({ lamport: 8 }),
    })).toThrow(WarpError);
  });

  it('rejects missing constructor carriers at runtime', () => {
    expect(() => new GitWarpTickWitnessLadder(
      // @ts-expect-error runtime guard for JavaScript callers
      undefined,
    )).toThrow(WarpError);

    expect(() => new GitWarpTickWitnessLadder({
      // @ts-expect-error runtime guard for JavaScript callers
      patch: undefined,
      patchSha: PATCH_SHA,
      receipt: makeReceipt(),
    })).toThrow(WarpError);

    expect(() => new GitWarpTickWitnessLadder({
      patch: makePatch(),
      patchSha: PATCH_SHA,
      // @ts-expect-error runtime guard for JavaScript callers
      receipt: undefined,
    })).toThrow(WarpError);
  });
});
