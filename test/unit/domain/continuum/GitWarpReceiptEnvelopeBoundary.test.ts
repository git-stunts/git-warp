import { describe, expect, it } from 'vitest';

import { GitWarpReceiptEnvelopeBoundary } from '../../../../advanced.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import { TickReceipt } from '../../../../src/domain/types/TickReceipt.ts';

function makeReceipt(): TickReceipt {
  return new TickReceipt({
    patchSha: 'd'.repeat(40),
    writer: 'writer-a',
    lamport: 11,
    ops: [
      {
        op: 'NodeAdd',
        target: 'node:a',
        result: 'applied',
      },
      {
        op: 'PropSet',
        target: 'node:a\u0000name',
        result: 'superseded',
        reason: 'LWW: writer writer-b at lamport 12 wins',
      },
      {
        op: 'EdgeAdd',
        target: 'node:a\u0000node:b\u0000knows',
        result: 'redundant',
      },
    ],
  });
}

describe('GitWarpReceiptEnvelopeBoundary', () => {
  it('projects a TickReceipt into a frozen stable external anchor', () => {
    const boundary = new GitWarpReceiptEnvelopeBoundary({ receipt: makeReceipt() });
    const anchor = boundary.stableAnchor();

    expect(Object.isFrozen(boundary)).toBe(true);
    expect(Object.isFrozen(anchor)).toBe(true);
    expect(anchor).toEqual({
      boundaryVersion: 'git-warp.receipt-envelope-boundary/v1',
      substrateFactKind: 'git-warp.tick-receipt',
      patchSha: 'd'.repeat(40),
      writer: 'writer-a',
      lamport: 11,
      outcomeCount: 3,
      appliedCount: 1,
      supersededCount: 1,
      redundantCount: 1,
      hasExplanatoryReasons: true,
    });
  });

  it('keeps raw operation details and debug reasons out of the stable anchor', () => {
    const boundary = new GitWarpReceiptEnvelopeBoundary({ receipt: makeReceipt() });
    const anchor = boundary.stableAnchor();

    expect(Object.hasOwn(anchor, 'ops')).toBe(false);
    expect(Object.hasOwn(anchor, 'reason')).toBe(false);
    expect(Object.hasOwn(anchor, 'receipt')).toBe(false);
    expect(boundary.receiptShell.hasExplanatoryReasons()).toBe(true);
  });

  it('rejects missing or non-receipt carriers at runtime', () => {
    expect(
      () =>
        new GitWarpReceiptEnvelopeBoundary(
          // @ts-expect-error runtime guard for JavaScript callers
          undefined
        )
    ).toThrow(WarpError);

    expect(
      () =>
        new GitWarpReceiptEnvelopeBoundary({
          // @ts-expect-error runtime guard for JavaScript callers
          receipt: undefined,
        })
    ).toThrow(WarpError);
  });
});
