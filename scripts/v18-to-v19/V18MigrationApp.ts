import type { BijouContext } from '@flyingrobots/bijou';
import { startApp } from '@flyingrobots/bijou-node';
import {
  createFramedApp,
  createKeyMap,
  quit,
  type Cmd,
  type FramePage,
  type FramePageMsg,
} from '@flyingrobots/bijou-tui';

import { runV18ToV19Migration, type V18MigrationCommandReport } from './V18MigrationCommand.ts';
import type V18MigrationExecutionMode from './V18MigrationExecutionMode.ts';
import type V18MigrationGraph from './V18MigrationGraph.ts';
import type { V18MigrationProgress } from './V18MigrationProgress.ts';
import type { V18MigrationPreflight } from './V18MigrationPreflight.ts';
import {
  renderV18MigrationApp,
  type V18MigrationAppModel,
  v18MigrationPhaseTitle,
} from './V18MigrationAppSurface.ts';

export type V18MigrationAppResult =
  | Readonly<{ status: 'cancelled' }>
  | Readonly<{ report: V18MigrationCommandReport; status: 'completed' }>
  | Readonly<{ error: unknown; status: 'failed' }>;

type V18MigrationAppMsg =
  | Readonly<{ type: 'primary-action' }>
  | Readonly<{ type: 'secondary-action' }>
  | Readonly<{ progress: V18MigrationProgress; type: 'progress' }>
  | Readonly<{ report: V18MigrationCommandReport; type: 'succeeded' }>
  | Readonly<{ error: unknown; message: string; type: 'failed' }>;

export type RunV18MigrationAppOptions = Readonly<{
  context: BijouContext;
  graph: V18MigrationGraph;
  mode: V18MigrationExecutionMode;
  passphrase?: string;
  preflight: V18MigrationPreflight;
  recoveryId?: string;
  repositoryPath: string;
  scratchRoot?: string;
}>;

/** Run the confirmation, progress, and result flow inside Bijou's framed shell. */
export async function runV18MigrationApp(
  options: RunV18MigrationAppOptions
): Promise<V18MigrationAppResult> {
  let result: V18MigrationAppResult = Object.freeze({ status: 'cancelled' });
  const execute: Cmd<V18MigrationAppMsg> = async (emit) => {
    try {
      const report = await runV18ToV19Migration({
        graph: options.graph.name,
        mode: options.mode,
        progress: (progress) => emit(Object.freeze({ progress, type: 'progress' })),
        repositoryPath: options.repositoryPath,
        ...(options.passphrase === undefined ? {} : { passphrase: options.passphrase }),
        ...(options.recoveryId === undefined ? {} : { recoveryId: options.recoveryId }),
        ...(options.scratchRoot === undefined ? {} : { scratchRoot: options.scratchRoot }),
      });
      result = Object.freeze({ report, status: 'completed' });
      return Object.freeze({ report, type: 'succeeded' });
    } catch (error: unknown) {
      result = Object.freeze({ error, status: 'failed' });
      return Object.freeze({
        error,
        message: formatFailure(error),
        type: 'failed',
      });
    }
  };
  const page = migrationPage(options, execute);
  const app = createFramedApp({
    ctx: options.context,
    defaultPageId: page.id,
    enableCommandPalette: false,
    keyPriority: 'page-first',
    pages: [page],
    runtimeNotifications: true,
    title: 'git-warp v18 to v19',
  });
  await startApp(app, { ctx: options.context });
  return result;
}

function migrationPage(
  options: RunV18MigrationAppOptions,
  execute: Cmd<V18MigrationAppMsg>
): FramePage<V18MigrationAppModel, V18MigrationAppMsg> {
  return {
    id: 'migration',
    title: (model) => v18MigrationPhaseTitle(model.phase),
    init: () => [Object.freeze({ phase: 'confirm' }), []],
    update: (message, model) => updateMigrationApp(message, model, execute),
    layout: (model) => ({
      kind: 'pane',
      paneId: 'migration',
      render: (width, height) => renderV18MigrationApp(options, model, width, height),
    }),
    keyMap: createKeyMap<V18MigrationAppMsg>().group('Migration', (group) =>
      group
        .bind('y', 'Confirm or continue', { type: 'primary-action' })
        .bind('enter', 'Confirm or continue', { type: 'primary-action' })
        .bind('n', 'Cancel or close', { type: 'secondary-action' })
        .bind('escape', 'Cancel or close', { type: 'secondary-action' })
        .bind('q', 'Cancel or close', { type: 'secondary-action' })
        .bind('ctrl+c', 'Cancel or close', { type: 'secondary-action' })
    ),
  };
}

function updateMigrationApp(
  message: FramePageMsg<V18MigrationAppMsg>,
  model: V18MigrationAppModel,
  execute: Cmd<V18MigrationAppMsg>
): [V18MigrationAppModel, Cmd<V18MigrationAppMsg>[]] {
  switch (message.type) {
    case 'primary-action':
      if (model.phase === 'confirm') {
        return [Object.freeze({ phase: 'running' }), [execute]];
      }
      if (model.phase === 'failed' || model.phase === 'succeeded') {
        return [model, [quit()]];
      }
      return [model, []];
    case 'secondary-action':
      if (model.phase === 'running') {
        return [model, []];
      }
      return [model, [quit()]];
    case 'progress':
      return [
        Object.freeze({
          phase: 'running',
          progress: message.progress,
        }),
        [],
      ];
    case 'succeeded':
      return [
        Object.freeze({
          phase: 'succeeded',
          report: message.report,
        }),
        [],
      ];
    case 'failed':
      return [
        Object.freeze({
          failure: message.message,
          phase: 'failed',
        }),
        [],
      ];
    case 'mouse':
    case 'pulse':
      return [model, []];
  }
}

function formatFailure(error: unknown, seen = new Set<unknown>()): string {
  if (seen.has(error)) {
    return '[circular failure]';
  }
  seen.add(error);
  const message = error instanceof Error ? error.message : String(error);
  const nested: string[] = [];
  if (error instanceof AggregateError) {
    error.errors.forEach((entry, index) => {
      nested.push(`failure ${String(index + 1)}: ${formatFailure(entry, seen)}`);
    });
  }
  if (error instanceof Error && error.cause !== undefined) {
    nested.push(`cause: ${formatFailure(error.cause, seen)}`);
  }
  return nested.length === 0 ? message : `${message}\n${nested.join('\n')}`;
}
