import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import CliFailureCode from './CliFailureCode.ts';
import { CLI_FAILURE_MESSAGE_BYTES } from './CliFailureLimits.ts';
import type { CliFailureRelation } from './CliFailureRelation.ts';

/** An owned, validated display node, detached from the original throwable. */
export default class CliFailureNode {
  readonly code: string;
  readonly message: string;
  readonly relation: CliFailureRelation;
  readonly causes: readonly CliFailureNode[];
  readonly truncated: boolean;

  constructor(options: {
    readonly code: string;
    readonly message: string;
    readonly relation: CliFailureRelation;
    readonly causes?: readonly CliFailureNode[];
    readonly truncated?: boolean;
  }) {
    this.code = new CliFailureCode(options.code).value;
    this.message = CliFailureNode.validatedMessage(options.message);
    this.relation = CliFailureNode.validatedRelation(options.relation);
    this.causes = Object.freeze([...(options.causes ?? [])]);
    if (!this.causes.every((cause) => cause instanceof CliFailureNode)) {
      throw new AdapterValidationError('CLI failure children must be validated display nodes');
    }
    this.truncated = CliFailureNode.validatedTruncation(options.truncated ?? false);
    Object.freeze(this);
  }
  private static validatedMessage(message: string): string {
    if (typeof message !== 'string' || new TextEncoder().encode(message).length > CLI_FAILURE_MESSAGE_BYTES) {
      throw new AdapterValidationError('CLI failure display message exceeds its byte bound');
    }
    return message;
  }

  private static validatedRelation(relation: CliFailureRelation): CliFailureRelation {
    if (!['cause', 'originalError', 'aggregate', 'cleanup'].includes(relation)) {
      throw new AdapterValidationError('Invalid CLI failure relation');
    }
    return relation;
  }

  private static validatedTruncation(truncated: boolean): boolean {
    if (typeof truncated !== 'boolean') {
      throw new AdapterValidationError('Invalid CLI failure truncation marker');
    }
    return truncated;
  }

}
