import { themeContrastRatio } from '@flyingrobots/bijou';
import { createTestContext } from '@flyingrobots/bijou/adapters/test';
import { describe, expect, it } from 'vitest';

import type { V18MigrationCommandReport } from '../../../scripts/v18-to-v19/V18MigrationCommand.ts';
import { renderV18MigrationApp } from '../../../scripts/v18-to-v19/V18MigrationAppSurface.ts';
import V18MigrationExecutionMode from '../../../scripts/v18-to-v19/V18MigrationExecutionMode.ts';
import V18MigrationGraph from '../../../scripts/v18-to-v19/V18MigrationGraph.ts';
import type { V18MigrationPreflight } from '../../../scripts/v18-to-v19/V18MigrationPreflight.ts';
import {
  createV18MigrationTheme,
  V18_MIGRATION_THEME,
} from '../../../scripts/v18-to-v19/V18MigrationTheme.ts';

const PREFLIGHT: V18MigrationPreflight = Object.freeze({
  repositoryObjectBytes: 80n * 1_048_576n,
  repositoryObjectCount: 2_000n,
  scratchAvailableBytes: 400n * 1_048_576n,
  scratchMinimumBytes: 160n * 1_048_576n,
  scratchPath: '/tmp',
  scratchSufficient: true,
  sourceAvailableBytes: 500n * 1_048_576n,
  sourceGitDirectory: '/tmp/think/.git',
});
const CONTEXT = createTestContext({
  mode: 'interactive',
  noColor: true,
  theme: createV18MigrationTheme(),
});
const SUCCESS_REPORT = Object.freeze({
  finalization: Object.freeze({
    promotedRefs: Object.freeze({ 'refs/warp/think/writers/local': 'b'.repeat(40) }),
    recoveryPrefix: 'refs/warp/think/recovery/v18-to-v19/manual',
    recoveryRefs: Object.freeze({ 'refs/warp/think/recovery/source': 'a'.repeat(40) }),
  }),
  plan: Object.freeze({
    derivedRefs: Object.freeze({}),
    graph: 'think',
    markerRef: 'refs/warp/think/substrate-version',
    preservedRefs: Object.freeze({}),
    repositoryPath: '/tmp/think',
    status: 'migration-required',
    writers: Object.freeze([]),
  }),
  scratchVerified: true,
  status: 'migrated',
}) satisfies V18MigrationCommandReport;

describe('v18 migration framed app', () => {
  it('keeps every rendered foreground above WCAG AAA on the primary surface', () => {
    const background = V18_MIGRATION_THEME.surface.primary.bg;
    expect(background).toBeDefined();
    for (const group of [
      V18_MIGRATION_THEME.semantic,
      V18_MIGRATION_THEME.status,
      V18_MIGRATION_THEME.border,
      V18_MIGRATION_THEME.ui,
    ]) {
      for (const [name, token] of Object.entries(group)) {
        expect(themeContrastRatio(token.hex, background!), name).toBeGreaterThanOrEqual(7);
      }
    }
    for (const [name, token] of Object.entries(V18_MIGRATION_THEME.surface)) {
      expect(token.bg, name).toBeDefined();
      expect(themeContrastRatio(token.hex, token.bg!), name).toBeGreaterThanOrEqual(7);
    }
  });

  it('deep-freezes the migration theme token graph', () => {
    expect(Object.isFrozen(V18_MIGRATION_THEME)).toBe(true);
    expect(Object.isFrozen(V18_MIGRATION_THEME.semantic)).toBe(true);
    expect(Object.isFrozen(V18_MIGRATION_THEME.semantic.primary)).toBe(true);
    expect(Object.isFrozen(V18_MIGRATION_THEME.gradient.progress)).toBe(true);
    expect(Object.isFrozen(V18_MIGRATION_THEME.gradient.progress[0])).toBe(true);
  });

  it('renders confirmation before any migration progress', () => {
    const surface = renderV18MigrationApp(
      {
        context: CONTEXT,
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

  it('keeps the confirmation prompt visible in a short frame', () => {
    const surface = renderV18MigrationApp(
      {
        context: CONTEXT,
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
      4
    );

    expect(surfaceRowText(surface, 3)).toContain('Press Y or Enter to continue.');
  });

  it('renders an insufficient scratch budget as a warning', () => {
    const surface = renderV18MigrationApp(
      {
        context: CONTEXT,
        graph: new V18MigrationGraph({
          name: 'think',
          refCount: 4,
          version: 'upgrade required (legacy unmarked substrate)',
          writerCount: 2,
        }),
        mode: V18MigrationExecutionMode.promote(),
        preflight: Object.freeze({
          ...PREFLIGHT,
          scratchAvailableBytes: 40n * 1_048_576n,
          scratchSufficient: false,
        }),
        repositoryPath: '/tmp/think',
      },
      { phase: 'confirm' },
      100,
      24
    );

    const rows = Array.from({ length: surface.height }, (_, row) => surfaceRowText(surface, row));
    const warningRow = rows.findIndex((line) => line.includes('BELOW OPERATING BUDGET'));
    expect(warningRow).toBeGreaterThanOrEqual(0);
    expect(
      surface
        .getRow(warningRow)
        .filter((cell) => cell.char !== ' ')
        .every((cell) => cell.fg === V18_MIGRATION_THEME.semantic.warning.hex)
    ).toBe(true);
  });

  it('renders bounded writer progress inside the frame', () => {
    const surface = renderV18MigrationApp(
      {
        context: CONTEXT,
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

  it('states successful completion without requiring status interpretation', () => {
    const surface = renderV18MigrationApp(
      {
        context: CONTEXT,
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
      { phase: 'succeeded', report: SUCCESS_REPORT },
      100,
      24
    );

    const text = surfaceText(surface);
    expect(text).toContain('Migration completed successfully.');
    expect(text).toContain('Status: migrated');
    expect(text).toContain('Scratch verified: yes');
    expect(text).toContain('Authoritative refs changed: yes');
    expect(text).toContain('Recovery refs: refs/warp/think/recovery/v18-to-v19/manual');
  });

  it('does not describe an incomplete success model as a migration failure', () => {
    const surface = renderV18MigrationApp(
      {
        context: CONTEXT,
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
      { phase: 'succeeded' },
      100,
      24
    );

    const text = surfaceText(surface);
    expect(text).toContain('Internal migration UI state is incomplete.');
    expect(text).not.toContain('Migration failed.');
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

function surfaceRowText(surface: ReturnType<typeof renderV18MigrationApp>, row: number): string {
  return surface
    .getRow(row)
    .map((cell) => cell.char)
    .join('')
    .trimEnd();
}
