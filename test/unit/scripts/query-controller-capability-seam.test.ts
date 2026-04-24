import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const queryControllerPath = join(
  process.cwd(),
  'src/domain/services/controllers/QueryController.ts',
);
const queryControllerSource = readFileSync(queryControllerPath, 'utf8');

describe('QueryController capability seam', () => {
  it('does not import WarpRuntime directly', () => {
    expect(queryControllerSource).not.toContain("import type WarpRuntime");
    expect(queryControllerSource).not.toContain("import WarpRuntime");
  });

  it('does not call the detached runtime helper directly', () => {
    expect(queryControllerSource).not.toContain("from './detachedOpen.ts'");
    expect(queryControllerSource).not.toContain('openDetachedGraph(');
  });

  it('does not cast observer resolution through WarpRuntime', () => {
    expect(queryControllerSource).not.toContain('as WarpRuntime');
  });
});
