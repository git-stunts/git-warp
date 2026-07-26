const COMMIT_PROGRESS_INTERVAL = 250;

export type V18MigrationPhase =
  | 'finalize'
  | 'inventory'
  | 'rewrite'
  | 'scratch'
  | 'verify';

export type V18MigrationProgress = Readonly<{
  completed?: number;
  message: string;
  phase: V18MigrationPhase;
  total?: number;
  writer?: string;
}>;

export type V18MigrationProgressReporter = (
  progress: V18MigrationProgress,
) => void;

export function reportV18MigrationProgress(
  reporter: V18MigrationProgressReporter | undefined,
  progress: V18MigrationProgress,
): void {
  reporter?.(Object.freeze({ ...progress }));
}

export function shouldReportV18CommitProgress(
  completed: number,
  total: number,
): boolean {
  return completed === total || completed % COMMIT_PROGRESS_INTERVAL === 0;
}
