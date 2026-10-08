import CliFailureNode from './CliFailureNode.ts';
import type { CliFailureRelation } from './CliFailureRelation.ts';
import type CliFailureRedactorAdapter from './CliFailureRedactorAdapter.ts';
import { CLI_FAILURE_MAX_DEPTH, CLI_FAILURE_MAX_NODES } from './CliFailureLimits.ts';
import { ownData, isError, isAggregate, displayCode, boundedEntries, safeLength } from './CliFailurePropertyReader.ts';

/** One traversal owns the shared primary/cleanup node and identity budget. */
export default class CliFailureTraversal {
  private readonly redactor: CliFailureRedactorAdapter;
  private readonly seen = new Set<object>();
  private count = 0;
  private omittedDetails = false;

  get truncated(): boolean { return this.omittedDetails; }

  constructor(redactor: CliFailureRedactorAdapter) { this.redactor = redactor; }

  appendRoot(children: CliFailureNode[], value: unknown, relation: CliFailureRelation): void {
    if (this.count >= CLI_FAILURE_MAX_NODES) { this.omittedDetails = true; return; }
    children.push(this.visit(value, relation, 0));
  }

  visit(value: unknown, relation: CliFailureRelation, depth: number): CliFailureNode {
    this.count++;
    if (depth > CLI_FAILURE_MAX_DEPTH) { return this.omitted(relation); }
    if (!isError(value)) { return this.unrecognized(relation); }
    if (this.seen.has(value)) { return this.omitted(relation); }
    this.seen.add(value);
    return this.decodeError(value, relation, depth);
  }

  private decodeError(value: Error, relation: CliFailureRelation, depth: number): CliFailureNode {
    const rawMessage = ownData(value, 'message');
    const display = typeof rawMessage === 'string'
      ? this.redactor.display(rawMessage) : { message: 'Unknown error', truncated: false };
    this.omittedDetails ||= display.truncated;
    const causes = this.children(value, depth);
    return new CliFailureNode({ code: displayCode(value), message: display.message, relation, causes, truncated: display.truncated });
  }

  private children(value: Error, depth: number): CliFailureNode[] {
    const children: CliFailureNode[] = [];
    this.append(children, ownData(value, 'cause'), { relation: 'cause', depth });
    const meta = ownData(value, 'meta');
    if (meta !== null && typeof meta === 'object') {
      this.append(children, ownData(meta, 'originalError'), { relation: 'originalError', depth });
    }
    if (isAggregate(value)) { this.aggregate(children, ownData(value, 'errors'), depth); }
    return children;
  }

  private append(children: CliFailureNode[], value: unknown,
    edge: { readonly relation: CliFailureRelation; readonly depth: number }): void {
    if (value === undefined) { return; }
    if (this.count >= CLI_FAILURE_MAX_NODES) {
      this.omittedDetails = true;
      return;
    }
    children.push(this.visit(value, edge.relation, edge.depth + 1));
  }

  private aggregate(children: CliFailureNode[], values: unknown, depth: number): void {
    const members = boundedEntries(values);
    for (const member of members) {
      this.append(children, member, { relation: 'aggregate', depth });
      if (this.count >= CLI_FAILURE_MAX_NODES) { break; }
    }
    if (safeLength(values) > members.length) { this.omittedDetails = true; }
  }

  private omitted(relation: CliFailureRelation): CliFailureNode {
    this.omittedDetails = true;
    return new CliFailureNode({
      code: 'E_INTERNAL', message: 'Further failure details omitted', relation, truncated: true,
    });
  }

  private unrecognized(relation: CliFailureRelation): CliFailureNode {
    return new CliFailureNode({ code: 'E_INTERNAL', message: 'Unknown error', relation });
  }
}
