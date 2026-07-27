import { createSurface, type Cell, type Surface, type TokenValue } from '@flyingrobots/bijou';

import type { V18MigrationCommandReport } from './V18MigrationCommand.ts';
import type V18MigrationExecutionMode from './V18MigrationExecutionMode.ts';
import type V18MigrationGraph from './V18MigrationGraph.ts';
import type { V18MigrationProgress } from './V18MigrationProgress.ts';
import { formatV18MigrationBytes, type V18MigrationPreflight } from './V18MigrationPreflight.ts';
import { V18_MIGRATION_THEME } from './V18MigrationTheme.ts';

export type V18MigrationAppPhase = 'confirm' | 'failed' | 'running' | 'succeeded';

export type V18MigrationAppModel = Readonly<{
  failure?: string;
  phase: V18MigrationAppPhase;
  progress?: V18MigrationProgress;
  report?: V18MigrationCommandReport;
}>;

export type V18MigrationAppViewOptions = Readonly<{
  graph: V18MigrationGraph;
  mode: V18MigrationExecutionMode;
  preflight: V18MigrationPreflight;
  repositoryPath: string;
}>;

/** Render the migration page to a bounded, high-contrast terminal surface. */
export function renderV18MigrationApp(
  options: V18MigrationAppViewOptions,
  model: V18MigrationAppModel,
  width: number,
  height: number
): Surface {
  const surfaceToken = V18_MIGRATION_THEME.surface.primary;
  const surface = createSurface(
    Math.max(0, width),
    Math.max(0, height),
    cellFrom(surfaceToken, ' ')
  );
  const lines = migrationLines(options, model, width);
  lines.slice(0, surface.height).forEach((line, row) => {
    writeLine(surface, row, line.text, line.token);
  });
  return surface;
}

export function v18MigrationPhaseTitle(phase: V18MigrationAppPhase): string {
  switch (phase) {
    case 'confirm':
      return 'Confirm';
    case 'running':
      return 'Migrating';
    case 'succeeded':
      return 'Complete';
    case 'failed':
      return 'Recovery';
  }
}

type StyledLine = Readonly<{ text: string; token: TokenValue }>;

function migrationLines(
  options: V18MigrationAppViewOptions,
  model: V18MigrationAppModel,
  width: number
): StyledLine[] {
  const body = V18_MIGRATION_THEME.surface.primary;
  const accent = V18_MIGRATION_THEME.semantic.accent;
  const primary = V18_MIGRATION_THEME.semantic.primary;
  const warning = V18_MIGRATION_THEME.semantic.warning;
  const success = V18_MIGRATION_THEME.semantic.success;
  const error = V18_MIGRATION_THEME.semantic.error;
  const lines: StyledLine[] = [
    { text: 'Retained-substrate migration', token: primary },
    { text: '', token: body },
    ...wrapStyled(`Repository: ${options.repositoryPath}`, width, body),
    ...wrapStyled(`Selected graph: ${options.graph.summary()}`, width, body),
    {
      text: `Mode: ${options.mode.promotesVerifiedRefs() ? 'verified migration and atomic promotion' : 'disposable rehearsal'}`,
      token: accent,
    },
    { text: '', token: body },
  ];
  if (model.phase === 'confirm') {
    lines.push(
      { text: 'Nothing changes before you confirm.', token: warning },
      {
        text:
          `Git object storage: ${formatV18MigrationBytes(options.preflight.repositoryObjectBytes)}` +
          ` across ${String(options.preflight.repositoryObjectCount)} objects`,
        token: body,
      },
      ...wrapStyled(
        `Scratch: ${options.preflight.scratchPath} · ${formatV18MigrationBytes(options.preflight.scratchAvailableBytes)} free`,
        width,
        body
      ),
      {
        text:
          `Operating budget: ${formatV18MigrationBytes(options.preflight.scratchMinimumBytes)}` +
          ' minimum (byte volume and loose-object allocation)',
        token: options.preflight.scratchSufficient ? success : warning,
      },
      {
        text: `Source Git volume free: ${formatV18MigrationBytes(options.preflight.sourceAvailableBytes)}`,
        token: body,
      },
      {
        text: options.preflight.scratchSufficient
          ? 'Scratch capacity check: sufficient.'
          : 'Scratch capacity check: BELOW OPERATING BUDGET.',
        token: options.preflight.scratchSufficient ? success : warning,
      },
      {
        text: 'The tool builds and verifies a disposable repository before promoting refs.',
        token: body,
      },
      {
        text: options.mode.promotesVerifiedRefs()
          ? 'Promotion archives source refs under recovery refs and can roll back atomically.'
          : 'This rehearsal discards its scratch repository and never changes authoritative refs.',
        token: body,
      },
      { text: '', token: body },
      { text: 'Press Y or Enter to continue. Press N, Esc, or Q to cancel.', token: primary }
    );
    return lines;
  }
  if (model.phase === 'running') {
    const progress = model.progress;
    lines.push(
      {
        text:
          progress === undefined
            ? 'Starting migration...'
            : `[${progress.phase}]${progress.writer === undefined ? '' : ` ${progress.writer}`}`,
        token: accent,
      },
      ...wrapStyled(progress?.message ?? 'Preparing migration command', width, body)
    );
    if (progress?.completed !== undefined && progress.total !== undefined) {
      const percent = progressPercent(progress.completed, progress.total);
      lines.push({
        text: progressLine(percent, progress.completed, progress.total, width),
        token: success,
      });
    }
    lines.push(
      { text: '', token: body },
      {
        text: 'Migration is running. Exit keys are disabled until it reaches a safe boundary.',
        token: warning,
      }
    );
    return lines;
  }
  if (model.phase === 'succeeded' && model.report !== undefined) {
    const report = model.report;
    lines.push(
      { text: `Migration ${report.status}.`, token: success },
      { text: `Writers: ${String(report.plan.writers.length)}`, token: body },
      {
        text: `Scratch verified: ${report.scratchVerified ? 'yes' : 'no'}`,
        token: body,
      }
    );
    if (report.finalization !== null) {
      lines.push(
        ...wrapStyled(`Recovery refs: ${report.finalization.recoveryPrefix}`, width, body)
      );
    }
    lines.push({ text: '', token: body }, { text: 'Press Enter or Q to close.', token: primary });
    return lines;
  }
  lines.push(
    { text: 'Migration failed.', token: error },
    ...wrapStyled(model.failure ?? 'Unknown failure', width, body),
    { text: '', token: body },
    {
      text: 'Authoritative promotion failures are rolled back; retained recovery refs are not deleted.',
      token: warning,
    },
    { text: 'Press Enter or Q to close and inspect the error.', token: primary }
  );
  return lines;
}

function progressPercent(completed: number, total: number): number {
  return total === 0 ? 100 : Math.min(100, Math.max(0, (completed / total) * 100));
}

function progressLine(percent: number, completed: number, total: number, width: number): string {
  const label = ` ${String(completed)}/${String(total)} ${percent.toFixed(1)}%`;
  const barWidth = Math.max(4, Math.min(42, width - label.length - 3));
  const filled = Math.round((percent / 100) * barWidth);
  return `[${'█'.repeat(filled)}${'░'.repeat(barWidth - filled)}]${label}`;
}

function wrapStyled(text: string, width: number, token: TokenValue): StyledLine[] {
  const maximum = Math.max(1, width);
  const words = text.split(/\s+/u);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (word.length > maximum) {
      if (current.length > 0) {
        lines.push(current);
        current = '';
      }
      for (let offset = 0; offset < word.length; offset += maximum) {
        lines.push(word.slice(offset, offset + maximum));
      }
      continue;
    }
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length > maximum) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0 || lines.length === 0) {
    lines.push(current);
  }
  return lines.map((line) => Object.freeze({ text: line, token }));
}

function writeLine(surface: Surface, row: number, text: string, token: TokenValue): void {
  Array.from(text)
    .slice(0, surface.width)
    .forEach((character, column) => {
      surface.set(column, row, cellFrom(token, character));
    });
}

function cellFrom(token: TokenValue, char: string): Cell {
  const background = token.bg ?? V18_MIGRATION_THEME.surface.primary.bg;
  return {
    char,
    ...(background === undefined ? {} : { bg: background }),
    fg: token.hex,
    ...(token.modifiers === undefined ? {} : { modifiers: token.modifiers }),
  };
}
