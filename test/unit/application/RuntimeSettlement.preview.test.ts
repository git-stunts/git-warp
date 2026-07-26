import { describe, expect, it } from 'vitest';

import {
  previewRuntimeSettlement,
  settleRuntimePlan,
} from '../../../src/application/RuntimeSettlement.ts';
import { settlementHarness } from '../../helpers/SettlementHarness.ts';

describe('Runtime settlement coordination', () => {
  it('previews and promotes an exact derived plan', async () => {
    const harness = settlementHarness();

    const preview = await previewRuntimeSettlement(harness.options, harness.owner);
    const receipt = await settleRuntimePlan(preview.plan, harness.owner);

    expect(preview).toMatchObject({
      operation: 'preview-settlement',
      outcome: { kind: 'derived' },
    });
    expect(receipt).toMatchObject({
      operation: 'settle',
      outcome: { kind: 'derived' },
      plan: preview.plan,
    });
    expect(harness.promote).toHaveBeenCalledOnce();
    expect(receipt.evidence.support).toContainEqual({
      id: 'admission:promotion',
    });
  });

  it('returns a stale-basis receipt without promotion after recapture changes', async () => {
    const harness = settlementHarness();
    const preview = await previewRuntimeSettlement(harness.options, harness.owner);
    harness.setSnapshot({ targetFrontierRef: 'admission:target:new' });

    const receipt = await settleRuntimePlan(preview.plan, harness.owner);

    expect(receipt).toMatchObject({
      reason: 'git-warp.settlement-stale-basis',
      repairHints: [{ code: 'repreview-settlement' }],
    });
    expect(receipt.outcome.kind).toBe('obstruction');
    expect(harness.promote).not.toHaveBeenCalled();
  });

  it('records a failed promotion as an invalid derivation', async () => {
    const harness = settlementHarness({
      promotion: {
        accepted: false,
        evidence: {
          basis: { id: 'admission:promotion-failure' },
          support: [],
        },
        reason: 'writer compare-and-swap failed',
      },
    });
    const preview = await previewRuntimeSettlement(harness.options, harness.owner);

    const receipt = await settleRuntimePlan(preview.plan, harness.owner);

    expect(receipt).toMatchObject({
      reason: 'git-warp.settlement-promotion-failed',
      outcome: { kind: 'obstruction' },
    });
    if (receipt.outcome.kind !== 'obstruction') {
      throw new Error('expected promotion obstruction');
    }
    expect(receipt.outcome.witness.reason.family).toBe('invalid-derivation');
    expect(receipt.evidence.support).toContainEqual({
      id: 'admission:promotion-failure',
    });
  });

  it.each([
    [
      'empty source',
      { status: 'empty' as const },
      'git-warp.settlement-source-empty',
    ],
    [
      'divergent target',
      { targetFrontierRef: 'admission:target:diverged' },
      'git-warp.settlement-common-basis-required',
    ],
  ])('keeps an %s obstruction non-executable', async (
    _label,
    snapshot,
    reason,
  ) => {
    const harness = settlementHarness({ snapshot });
    const preview = await previewRuntimeSettlement(harness.options, harness.owner);

    const receipt = await settleRuntimePlan(preview.plan, harness.owner);

    expect(preview.outcome.kind).toBe('obstruction');
    expect(receipt.reason).toBe(reason);
    expect(receipt.outcome).toBe(preview.outcome);
    expect(harness.promote).not.toHaveBeenCalled();
  });

  it('rejects invalid lane boundaries and foreign ownership', async () => {
    const harness = settlementHarness();
    await expect(previewRuntimeSettlement(
      null as never,
      harness.owner,
    )).rejects.toMatchObject({ code: 'E_RUNTIME_SETTLEMENT_OPTIONS' });
    await expect(previewRuntimeSettlement({
      source: harness.target,
      target: harness.target,
    }, harness.owner)).rejects.toMatchObject({
      code: 'E_RUNTIME_SETTLEMENT_SOURCE_KIND',
    });
    await expect(previewRuntimeSettlement({
      source: harness.source,
      target: harness.source,
    }, harness.owner)).rejects.toMatchObject({
      code: 'E_RUNTIME_SETTLEMENT_TARGET_KIND',
    });
    await expect(previewRuntimeSettlement(
      harness.options,
      {},
    )).rejects.toMatchObject({
      code: 'E_RUNTIME_SETTLEMENT_FOREIGN_LANE',
    });

    const wrongParent = settlementHarness({ parentName: 'other' });
    await expect(previewRuntimeSettlement(
      wrongParent.options,
      wrongParent.owner,
    )).rejects.toMatchObject({
      code: 'E_RUNTIME_SETTLEMENT_TARGET_PARENT',
    });
  });

  it('rejects unissued and foreign settlement plans', async () => {
    const harness = settlementHarness();
    const preview = await previewRuntimeSettlement(harness.options, harness.owner);

    await expect(settleRuntimePlan(
      { ...preview.plan },
      harness.owner,
    )).rejects.toMatchObject({ code: 'E_RUNTIME_SETTLEMENT_PLAN' });
    await expect(settleRuntimePlan(
      preview.plan,
      {},
    )).rejects.toMatchObject({
      code: 'E_RUNTIME_SETTLEMENT_FOREIGN_PLAN',
    });
  });
});
