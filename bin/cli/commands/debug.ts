import { usageError } from '../infrastructure.ts';

import * as coordinateTopic from './debug/coordinate.ts';
import * as conflictsTopic from './debug/conflicts.ts';
import * as provenanceTopic from './debug/provenance.ts';
import * as receiptsTopic from './debug/receipts.ts';
import * as timelineTopic from './debug/timeline.ts';
import type { CliOptions } from '../types.ts';

type DebugTopicModule = {
  DEBUG_TOPIC: { name: string; summary: string };
  handleDebugTopic: (params: { options: CliOptions; args: string[] }) => Promise<{ payload: unknown; exitCode: number }>;
};

const DEBUG_TOPICS: Record<string, DebugTopicModule> = Object.freeze({
  [coordinateTopic.DEBUG_TOPIC.name]: coordinateTopic,
  [conflictsTopic.DEBUG_TOPIC.name]: conflictsTopic,
  [provenanceTopic.DEBUG_TOPIC.name]: provenanceTopic,
  [receiptsTopic.DEBUG_TOPIC.name]: receiptsTopic,
  [timelineTopic.DEBUG_TOPIC.name]: timelineTopic,
});

/** Builds the usage text for the debug command listing all available topics. */
function buildDebugUsage(): string {
  const topicLines = Object.values(DEBUG_TOPICS)
    .map(({ DEBUG_TOPIC }) => `  ${DEBUG_TOPIC.name.padEnd(12)} ${DEBUG_TOPIC.summary}`);
  return [
    'Usage: warp-graph debug <topic> [options]',
    ...topicLines,
  ].join('\n');
}

/** Routes debug subcommands to their respective topic handlers. */
export default async function handleDebug({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const topicName = args[0];
  const rest = args.slice(1);

  if (topicName === undefined || topicName === null || topicName.length === 0) {
    throw usageError(buildDebugUsage());
  }

  const topic = DEBUG_TOPICS[topicName];
  if (!topic) {
    throw usageError(`Unknown debug topic: ${topicName}\n${buildDebugUsage()}`);
  }

  return await topic.handleDebugTopic({ options, args: rest });
}
