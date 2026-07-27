import { themeContrastRatio } from '@flyingrobots/bijou';
import { describe, expect, it } from 'vitest';

import { renderV18MigrationApp } from '../../../scripts/v18-to-v19/V18MigrationAppSurface.ts';
import V18MigrationExecutionMode from '../../../scripts/v18-to-v19/V18MigrationExecutionMode.ts';
import V18MigrationGraph from '../../../scripts/v18-to-v19/V18MigrationGraph.ts';
import type { V18MigrationPreflight } from '../../../scripts/v18-to-v19/V18MigrationPreflight.ts';
import { V18_MIGRATION_THEME } from '../../../scripts/v18-to-v19/V18MigrationTheme.ts';

const PREFLIGHT: V18MigrationPreflight = Object.freeze({
  repositoryObjectBytes: 80n * 1_048_576n,
  scratchAvailableBytes: 400n * 1_048_576n,
  scratchMinimumBytes: 160n * 1_048_576n,
  scratchPath: '/tmp',
  scratchSufficient: true,
  sourceAvailableBytes: 500n * 1_048_576n,
  sourceGitDirectory: '/tmp/think/.git',
});

describe('v18 migration framed app', () => {
  it('keeps every surface text pair above WCAG AAA contrast', () => {
    for (const [name, token] of Object.entries(V18_MIGRATION_THEME.surface)) {
      expect(token.bg, name).toBeDefined();
      expect(themeContrastRatio(token.hex, token.bg!), name).toBeGreaterThanOrEqual(7);
    }
  });

  it('renders confirmation before any migration progress', () => {
    const surface = renderV18MigrationApp(
      {
        graph: new V18MigrationGraph({
          name: 'think',
          refCount: 4,
          version: 'upgrade required (legacy unmarked substrate)',
          writerCount: 2,
        }),
        mode: V18MigrationExecutionMode.promote(),
        preflight: PREFLIGHT,
        repositoryPath: '/tmp/think',
      },
      { phase: 'confirm' },
      100,
      24
    );

    const text = surfaceText(surface);
    expect(text).toContain('Nothing changes before you confirm.');
    expect(text).toContain('Git object storage: 80.0 MiB');
    expect(text).toContain('Scratch capacity check: sufficient.');
    expect(text).toContain('Press Y or Enter to continue.');
    expect(text).not.toContain('Starting migration');
  });

  it('renders bounded writer progress inside the frame', () => {
    const surface = renderV18MigrationApp(
      {
        graph: new V18MigrationGraph({
          name: 'think',
          refCount: 4,
          version: 'upgrade required (legacy unmarked substrate)',
          writerCount: 2,
        }),
        mode: V18MigrationExecutionMode.promote(),
        preflight: PREFLIGHT,
        repositoryPath: '/tmp/think',
      },
      {
        phase: 'running',
        progress: {
          completed: 250,
          message: 'translating writer chain',
          phase: 'rewrite',
          total: 1_000,
          writer: 'local.cli',
        },
      },
      100,
      24
    );

    const text = surfaceText(surface);
    expect(text).toContain('[rewrite] local.cli');
    expect(text).toContain('250/1000 25.0%');
    expect(text).toContain('███████████');
  });
});

function surfaceText(surface: ReturnType<typeof renderV18MigrationApp>): string {
  return Array.from({ length: surface.height }, (_, row) =>
    surface
      .getRow(row)
      .map((cell) => cell.char)
      .join('')
      .trimEnd()
  ).join('\n');
}
