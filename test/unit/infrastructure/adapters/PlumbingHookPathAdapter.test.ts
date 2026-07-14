import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import PlumbingHookPathAdapter from '../../../../src/infrastructure/adapters/PlumbingHookPathAdapter.ts';
import type { GitPlumbing, CollectableStream } from '../../../../src/infrastructure/adapters/gitErrorClassification.ts';

function buildEmptyStream(): CollectableStream {
  return {
    async *[Symbol.asyncIterator]() {
      yield new Uint8Array(0);
    },
    async collect() {
      return Buffer.alloc(0);
    },
  };
}

function buildAdapter(execute: GitPlumbing['execute']): PlumbingHookPathAdapter {
  const plumbing: GitPlumbing = {
    emptyTree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    execute,
    async executeStream() {
      return buildEmptyStream();
    },
  };
  return new PlumbingHookPathAdapter({
    plumbing,
    path,
  });
}

describe('PlumbingHookPathAdapter', () => {
  it('uses core.hooksPath when set to an absolute path', async () => {
    const execute = vi.fn(async ({ args }: { args: string[] }) => {
      if (args[0] === 'config') {
        return '/custom/hooks\n';
      }
      throw new Error('unexpected call');
    });
    const adapter = buildAdapter(execute);

    await expect(adapter.resolveHooksDir('/repo')).resolves.toBe('/custom/hooks');
    expect(execute).toHaveBeenCalledWith({ args: ['config', '--get', 'core.hooksPath'] });
  });

  it('resolves relative core.hooksPath against repo root', async () => {
    const execute = vi.fn(async ({ args }: { args: string[] }) => {
      if (args[0] === 'config') {
        return 'my-hooks\n';
      }
      throw new Error('unexpected call');
    });
    const adapter = buildAdapter(execute);

    await expect(adapter.resolveHooksDir('/repo')).resolves.toBe('/repo/my-hooks');
  });

  it('falls back to git-dir hooks when core.hooksPath is unset', async () => {
    const execute = vi.fn(async ({ args }: { args: string[] }) => {
      if (args[0] === 'config') {
        throw new Error('missing');
      }
      if (args[0] === 'rev-parse') {
        return '.git\n';
      }
      throw new Error('unexpected call');
    });
    const adapter = buildAdapter(execute);

    await expect(adapter.resolveHooksDir('/repo')).resolves.toBe('/repo/.git/hooks');
  });

  it('falls back to repo .git/hooks when git-dir lookup also fails', async () => {
    const execute = vi.fn(async () => {
      throw new Error('missing');
    });
    const adapter = buildAdapter(execute);

    await expect(adapter.resolveHooksDir('/repo')).resolves.toBe('/repo/.git/hooks');
  });
});
