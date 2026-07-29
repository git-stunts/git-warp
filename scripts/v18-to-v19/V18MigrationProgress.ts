export type V18MigrationPhase = 'finalize' | 'inventory' | 'rewrite' | 'scratch' | 'verify';

export type V18MigrationProgress = Readonly<{
  completed?: number;
  message: string;
  phase: V18MigrationPhase;
  total?: number;
  writer?: string;
}>;

export type V18MigrationProgressReporter = (progress: V18MigrationProgress) => void;

export function reportV18MigrationProgress(
  reporter: V18MigrationProgressReporter | undefined,
  progress: V18MigrationProgress
): void {
  reporter?.(Object.freeze({ ...progress }));
}

/** Convert bounded work counts into the percentage expected by Bijou. */
export function v18MigrationProgressPercent(completed: number, total: number): number {
  return total === 0 ? 100 : Math.min(100, Math.max(0, (completed / total) * 100));
}
