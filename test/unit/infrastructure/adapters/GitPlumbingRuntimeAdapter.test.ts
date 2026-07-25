import { describe, expect, it } from 'vitest';
import { openDefaultGitPlumbing }
  from '../../../../src/infrastructure/adapters/GitPlumbingRuntimeAdapter.ts';

describe('GitPlumbingRuntimeAdapter', () => {
  it('opens the dependency runtime behind the typed WARP plumbing boundary', async () => {
    const plumbing = await openDefaultGitPlumbing(process.cwd());

    expect(plumbing.emptyTree).toMatch(/^[0-9a-f]{40,64}$/u);
    expect(plumbing.execute).toBeTypeOf('function');
    expect(plumbing.executeStream).toBeTypeOf('function');
  });
});
