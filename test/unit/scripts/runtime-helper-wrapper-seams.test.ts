import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const detachedFactorySource = readFileSync(
  join(process.cwd(), 'src/domain/capabilities/DetachedGraphFactory.ts'),
  'utf8',
);
const runtimeDetachedFactorySource = readFileSync(
  join(process.cwd(), 'src/domain/warp/RuntimeDetachedFactory.ts'),
  'utf8',
);
const runtimePatchCollectorSource = readFileSync(
  join(process.cwd(), 'src/domain/warp/RuntimePatchCollector.ts'),
  'utf8',
);
const runtimeStateStoreSource = readFileSync(
  join(process.cwd(), 'src/domain/warp/RuntimeStateStore.ts'),
  'utf8',
);
const detachedOpenSource = readFileSync(
  join(process.cwd(), 'src/domain/services/controllers/detachedOpen.ts'),
  'utf8',
);

describe('runtime helper wrapper seams', () => {
  it('does not import WarpRuntime directly in detached graph surfaces', () => {
    expect(detachedFactorySource).not.toContain('WarpRuntime');
    expect(runtimeDetachedFactorySource).not.toContain('import type WarpRuntime');
    expect(detachedOpenSource).not.toContain('import type WarpRuntime');
  });

  it('does not import WarpRuntime directly in patch/state wrappers', () => {
    expect(runtimePatchCollectorSource).not.toContain('import type WarpRuntime');
    expect(runtimeStateStoreSource).not.toContain('import type WarpRuntime');
  });

  it('does not rely on adapter casts inside runtime patch collector', () => {
    expect(runtimePatchCollectorSource).not.toContain(' as ');
  });
});
