import { describe, it, expect } from 'vitest';

import { callInternalRuntimeMethod } from '../../../../src/domain/utils/callInternalRuntimeMethod.ts';

describe('callInternalRuntimeMethod', () => {
  it('uses the grandparent implementation when a facade shim shadows the name', async () => {
    class RuntimeBase {
      async getContent(value: unknown) {
        return `base:${value}`;
      }
    }

    class FacadeShim extends RuntimeBase {
      override async getContent(_value: unknown): Promise<string> {
        throw new Error('shim should be skipped');
      }
    }

    await expect(callInternalRuntimeMethod(new FacadeShim(), 'getContent', 'x'))
      .resolves.toBe('base:x');
  });

  it('throws a typed error when the resolved candidate is not callable', async () => {
    await expect(callInternalRuntimeMethod({ getContent: 'nope' }, 'getContent'))
      .rejects.toThrow('missing internal runtime method: getContent');
  });

  it('handles null-prototype targets by falling back to own properties', async () => {
    const target = Object.create(null) as Record<string, unknown>;
    target['lookup'] = async () => 'ok';

    await expect(callInternalRuntimeMethod(target, 'lookup')).resolves.toBe('ok');
  });

  it('fails predictably when called with an undefined target', async () => {
    await expect(
      callInternalRuntimeMethod(undefined as unknown as object, 'missing'),
    ).rejects.toThrow(TypeError);
  });
});
