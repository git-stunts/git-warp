import { describe, expect, it } from 'vitest';
import RuntimeOptionAdmission from '../../../src/application/RuntimeOptionAdmission.ts';
import WarpError from '../../../src/domain/errors/WarpError.ts';

const admission = new RuntimeOptionAdmission({
  operation: 'Runtime.example',
  code: 'E_EXAMPLE_OPTIONS',
  supported: ['name', 'mode'],
});

function rejection(options: object): WarpError {
  try {
    admission.admit(options);
  } catch (error) {
    if (error instanceof WarpError) { return error; }
    throw error;
  }
  throw new Error('expected admission to reject the options');
}

describe('RuntimeOptionAdmission', () => {
  it('is frozen with a defensive copy of the supported keys', () => {
    const supported = ['name'];
    const frozen = new RuntimeOptionAdmission({ operation: 'Runtime.x', code: 'E_X', supported });
    supported.push('at');

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(frozen.supported).toEqual(['name']);
  });

  it.each([
    ['an empty object', {}],
    ['supported data keys', { name: 'n', mode: 'm' }],
    ['a null-prototype object', Object.assign(Object.create(null), { name: 'n' })],
  ])('admits %s', (_case, options) => {
    expect(() => admission.admit(options)).not.toThrow();
  });

  it('names an unsupported string key and the supported keys', () => {
    const error = rejection({ name: 'n', at: 'tick:1' });

    expect(error.code).toBe('E_EXAMPLE_OPTIONS');
    expect(error.message).toBe("Runtime.example does not accept option 'at'; supported options: name, mode");
    expect(error.context).toEqual({ rejected: 'at', supported: ['name', 'mode'] });
  });

  it('rejects a non-enumerable unsupported key', () => {
    expect(rejection(Object.defineProperty({ name: 'n' }, 'at', { value: 1 })).context)
      .toMatchObject({ rejected: 'at' });
  });

  it('rejects a symbol key', () => {
    expect(rejection({ [Symbol('at')]: 1 }).context).toMatchObject({ rejected: 'Symbol(at)' });
  });

  it('rejects a supported key defined as an accessor', () => {
    const error = rejection(Object.defineProperty({}, 'name', { get: () => 'n' }));

    expect(error.message).toBe("Runtime.example option 'name' must be an own data property; supported options: name, mode");
  });

  it('rejects keys inherited from a custom prototype, even supported ones', () => {
    const grandparent = { at: 'tick:1' };
    const parent = Object.create(grandparent);
    const options = Object.assign(Object.create(parent), { name: 'n' });

    expect(rejection(options).context).toMatchObject({ rejected: 'at' });
    expect(rejection(Object.create({ name: 'n' })).message)
      .toBe("Runtime.example does not accept inherited option 'name'; supported options: name, mode");
  });
});
