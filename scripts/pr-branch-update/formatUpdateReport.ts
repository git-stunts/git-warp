import type { BranchUpdateResult } from './BranchUpdateResult.ts';

export type UpdateReportContext = {
  readonly baseRefName: string;
  readonly dryRun: boolean;
};

/** The Markdown job summary: one bullet per open pull request. */
export default function formatUpdateReport(
  results: readonly BranchUpdateResult[],
  context: UpdateReportContext,
): string {
  const heading = context.dryRun ? '## PR branch update (dry run)' : '## PR branch update';
  const body = results.length === 0
    ? [`No open pull request targets \`${context.baseRefName}\`.`]
    : results.map((result) => `- ${result.line}`);
  return [heading, '', ...body, ''].join('\n');
}
