import { usageError } from '../infrastructure.js';

import * as conflictsTopic from './debug/conflicts.js';
import * as provenanceTopic from './debug/provenance.js';
import * as receiptsTopic from './debug/receipts.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */
/**
 * @typedef {{
 *   DEBUG_TOPIC: { name: string, summary: string },
 *   handleDebugTopic: (params: { options: CliOptions, args: string[] }) => Promise<{ payload: unknown, exitCode: number }>
 * }} DebugTopicModule
 */

/** @type {Record<string, DebugTopicModule>} */
const DEBUG_TOPICS = Object.freeze({
  [conflictsTopic.DEBUG_TOPIC.name]: conflictsTopic,
  [provenanceTopic.DEBUG_TOPIC.name]: provenanceTopic,
  [receiptsTopic.DEBUG_TOPIC.name]: receiptsTopic,
});

function buildDebugUsage() {
  const topicLines = Object.values(DEBUG_TOPICS)
    .map(({ DEBUG_TOPIC }) => `  ${DEBUG_TOPIC.name.padEnd(12)} ${DEBUG_TOPIC.summary}`);
  return [
    'Usage: warp-graph debug <topic> [options]',
    ...topicLines,
  ].join('\n');
}

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export default async function handleDebug({ options, args }) {
  const topicName = args[0];
  const rest = args.slice(1);

  if (!topicName) {
    throw usageError(buildDebugUsage());
  }

  const topic = DEBUG_TOPICS[topicName];
  if (!topic) {
    throw usageError(`Unknown debug topic: ${topicName}\n${buildDebugUsage()}`);
  }

  return await topic.handleDebugTopic({ options, args: rest });
}
