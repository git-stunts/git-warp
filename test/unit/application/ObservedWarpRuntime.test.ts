import { describe, expect, it, vi } from 'vitest';
import ObservedWarp from '../../../src/application/ObservedWarp.ts';
import { askObservedWarp, bindObservedWarp } from '../../../src/application/ObservedWarpRuntime.ts';
import ObserverIdentity from '../../../src/domain/api/ObserverIdentity.ts';
import Purpose from '../../../src/domain/api/Purpose.ts';
import ReadBudget from '../../../src/domain/api/ReadBudget.ts';

describe('ObservedWarpRuntime', () => {
  const observer = ObserverIdentity.of('audit', 'agent-1');
  const purpose = Purpose.of('audit', 'investigation', 1);
  const budget = ReadBudget.of({ records: 10, bytes: 1024, work: 10 });
  const question = { subject: 'node-1', key: null };

  it('asks the Warp bound to the view, as the view observer', async () => {
    const view = new ObservedWarp(observer);
    const backend = vi.fn().mockResolvedValue('observation-result');
    bindObservedWarp(view, backend);

    expect(await askObservedWarp(view, { purpose, budget, question })).toBe('observation-result');
    expect(backend).toHaveBeenCalledWith({ observer, purpose, budget, question });
  });

  it('takes the observer from the view, never from the request it is given', async () => {
    const view = new ObservedWarp(observer);
    const backend = vi.fn().mockResolvedValue('observation-result');
    bindObservedWarp(view, backend);
    const smuggled = { purpose, budget, question, observer: ObserverIdentity.of('audit', 'intruder') };

    await askObservedWarp(view, smuggled);

    expect(backend).toHaveBeenCalledWith({ observer, purpose, budget, question });
  });

  it('refuses a view that no Warp bound (E_OPTIC_VIEW)', async () => {
    const view = new ObservedWarp(observer);

    await expect(askObservedWarp(view, { purpose, budget, question })).rejects.toMatchObject({ code: 'E_OPTIC_VIEW' });
  });
});
