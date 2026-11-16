import { describe, expect, it } from 'vitest';

import WitnessArguments from '../../../benchmarks/cone-showcase/WitnessArguments.ts';

describe('cone-showcase admitted scales', () => {
  it('selects both required scales by default without executing them', () => {
    expect(WitnessArguments.parse([])?.scales).toEqual([200, 2000]);
  });

  it('selects the bounded explicit pilot', () => {
    expect(WitnessArguments.parse(['200'])?.scales).toEqual([200]);
  });

  it('preserves an explicit order without duplicating work', () => {
    expect(WitnessArguments.parse(['2000', '200'])?.scales).toEqual([2000, 200]);
  });

  it.each([['200', '200'], ['20000'], ['2.5'], ['0'], ['--out'], ['200junk']])(
    'refuses unadmitted input %s', (...arguments_) => {
      expect(WitnessArguments.parse(arguments_)).toBeNull();
    },
  );
});
