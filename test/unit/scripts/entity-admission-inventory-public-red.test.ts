import { describe, expect, it } from 'vitest';

import * as advanced from '../../../advanced.ts';

describe('entity admission inventory public contract', () => {
  it('exposes the basis-bound inventory Observer and certificate reader', () => {
    expect(Reflect.get(advanced, 'createEntityAdmissionInventoryObserver')).toBeTypeOf(
      'function',
    );
    expect(Reflect.get(advanced, 'requireEntityAdmissionInventoryCertificate')).toBeTypeOf(
      'function',
    );
  });
});
