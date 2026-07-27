import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const rendererPath = fileURLToPath(
  new URL('../../../scripts/generated-sdk/RenderUsersSdkFixture.ts', import.meta.url),
);

function runRenderer(args: readonly string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [rendererPath, ...args], {
    encoding: 'utf8',
  });
}

describe('generated SDK renderer CLI', () => {
  it('reports a missing output option as a usage error', () => {
    const result = runRenderer([]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('GeneratedSdkUsageError');
    expect(result.stderr).toContain('missing required --out <path> argument');
    expect(result.stderr).not.toContain('contract drifted');
  });

  it('reports an incomplete output option as a usage error', () => {
    const result = runRenderer(['--out']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('GeneratedSdkUsageError');
    expect(result.stderr).toContain('--out flag requires a path argument');
    expect(result.stderr).not.toContain('contract drifted');
  });
});
