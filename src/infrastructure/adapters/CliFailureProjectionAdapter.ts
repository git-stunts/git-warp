import type CliFailureClassifierPort from '../../ports/CliFailureClassifierPort.ts';
import type CliFailureNode from './CliFailureNode.ts';
import CliFailureReport from './CliFailureReport.ts';
import type CliFailureRedactorAdapter from './CliFailureRedactorAdapter.ts';
import {
  CLI_FAILURE_INTERNAL_EXIT,
} from './CliFailureLimits.ts';
import CliFailureTraversal from './CliFailureTraversal.ts';
import { ownData, isError, displayCode, validExit, primaryIdentity, secondaryMembers, aggregateOverflow } from './CliFailurePropertyReader.ts';

/** Decodes only safe error fields into an owned, bounded display graph. */
export default class CliFailureProjectionAdapter {
  private readonly classifier: CliFailureClassifierPort;
  private readonly redactor: CliFailureRedactorAdapter;

  constructor(options: {
    readonly classifier: CliFailureClassifierPort;
    readonly redactor: CliFailureRedactorAdapter;
  }) {
    this.classifier = options.classifier;
    this.redactor = options.redactor;
  }

  project(primary: unknown, cleanup?: unknown): CliFailureReport {
    const traversal = new CliFailureTraversal(this.redactor);
    const identity = primaryIdentity(primary);
    const node = traversal.visit(identity, 'cause', 0);
    const extra: CliFailureNode[] = [];
    for (const sibling of this.aggregateSiblings(primary, identity)) {
      traversal.appendRoot(extra, sibling, 'aggregate');
    }
    if (cleanup !== undefined) { traversal.appendRoot(extra, cleanup, 'cleanup'); }
    const status = this.status(identity);
    const cause = isError(identity) ? ownData(identity, 'cause') : undefined;
    return new CliFailureReport({
      primary: node,
      code: status.code,
      exitCode: status.exitCode,
      ...(isError(cause) ? { cause: this.message(cause) } : {}),
      cleanup: extra,
      truncated: this.isTruncated(primary, traversal),
    });
  }

  private isTruncated(primary: unknown, traversal: CliFailureTraversal): boolean {
    return traversal.truncated || aggregateOverflow(primary);
  }

  private aggregateSiblings(primary: unknown, identity: unknown): readonly unknown[] {
    return primary === identity ? [] : secondaryMembers(primary);
  }

  private message(error: Error): string {
    const message = ownData(error, 'message');
    return typeof message === 'string' ? this.redactor.message(message) : 'Unknown error';
  }

  private status(error: unknown): { readonly code: string; readonly exitCode: number } {
    if (!isError(error) || !this.recognizesCli(error)) {
      return { code: 'E_INTERNAL', exitCode: CLI_FAILURE_INTERNAL_EXIT };
    }
    const exitCode = ownData(error, 'exitCode');
    return {
      code: displayCode(error),
      exitCode: validExit(exitCode) ? exitCode : CLI_FAILURE_INTERNAL_EXIT,
    };
  }

  private recognizesCli(error: Error): boolean {
    try { return this.classifier.isCliError(error); }
    catch { return false; }
  }
}
