import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.js';
import { openGraph } from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const STRAND_SUBCOMMAND = Object.freeze({
  name: 'create',
  summary: 'Create a pinned strand descriptor',
});

const CREATE_OPTIONS = {
  id: { type: 'string' },
  'lamport-ceiling': { type: 'string' },
  owner: { type: 'string' },
  scope: { type: 'string' },
  'lease-expires-at': { type: 'string' },
};

const createStrandSchema = z.object({
  id: z.string().optional(),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  owner: z.string().optional(),
  scope: z.string().optional(),
  'lease-expires-at': z.string().optional(),
}).strict().transform(normalizeStrandValues);

/**
 * Spreads an optional value into an object if defined.
 *
 * @param {string} key
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function optSpread(key, value) {
  return value !== undefined ? { [key]: value } : {};
}

/**
 * Normalizes parsed Zod values into strand create options.
 *
 * @param {{ id?: string | undefined, 'lamport-ceiling'?: number | undefined, owner?: string | undefined, scope?: string | undefined, 'lease-expires-at'?: string | undefined }} val
 * @param {unknown} [_ctx]
 * @returns {{ strandId?: string, lamportCeiling: number | null, owner?: string, scope?: string, leaseExpiresAt?: string }}
 */
function normalizeStrandValues(val, _ctx) {
  return {
    ...optSpread('strandId', val.id),
    lamportCeiling: val['lamport-ceiling'] ?? null,
    ...optSpread('owner', val.owner),
    ...optSpread('scope', val.scope),
    ...optSpread('leaseExpiresAt', val['lease-expires-at']),
  };
}

/**
 * Handles the strand create subcommand by parsing arguments and creating a new strand descriptor.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleStrandSubcommand({ options, args }) {
  const { values } = parseCommandArgs(args, CREATE_OPTIONS, createStrandSchema);
  const { graph, graphName } = await openGraph(options);
  const strand = await graph.createStrand(values);

  return {
    payload: {
      graph: graphName,
      strandAction: 'create',
      strand,
    },
    exitCode: EXIT_CODES.OK,
  };
}
