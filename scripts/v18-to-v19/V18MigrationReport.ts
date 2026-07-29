import type { V18MigrationCommandReport } from './V18MigrationCommand.ts';

/** Format the durable operator report printed after terminal UI teardown. */
export function formatV18MigrationReport(report: V18MigrationCommandReport): string {
  const lines = [
    'git-warp v18-to-v19 migration completed successfully',
    `status: ${report.status}`,
    `repository: ${report.plan.repositoryPath}`,
    `graph: ${report.plan.graph}`,
    `writers: ${String(report.plan.writers.length)}`,
    `scratch verified: ${report.scratchVerified ? 'yes' : 'no'}`,
    `authoritative refs changed: ${report.finalization === null ? 'no' : 'yes'}`,
  ];
  if (report.finalization !== null) {
    lines.push(`recovery refs: ${report.finalization.recoveryPrefix}`);
  }
  if (report.status === 'verified-dry-run') {
    lines.push('no authoritative refs changed; a later promotion reruns the migration');
  }
  return `${lines.join('\n')}\n`;
}
