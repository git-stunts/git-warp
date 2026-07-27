import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';

import { parseCommandArgs, usageError } from '../infrastructure.ts';
import type { CliOptions } from '../types.ts';
import { withRuntime } from '../v19/V19Runtime.ts';
import {
  applyReviewedSettlement,
  previewReviewedSettlement,
  reviewedSettlementFromValue,
  type SettlementSelector,
} from '../v19/V19SettlementReview.ts';
import {
  receiptEnvelope,
  renderReceipt,
} from '../../presenters/V19ReadingReceipt.ts';
import { parseMcpJson, toMcpJson } from '../../presenters/V19Json.ts';
import { stableStringify } from '../../presenters/json.ts';
import type { McpJsonValue } from './mcp/McpJsonValue.ts';
import type SettlementPreview from '../../../src/domain/api/SettlementPreview.ts';

const PREVIEW_OPTIONS = {
  source: { type: 'string' },
  target: { type: 'string' },
  out: { type: 'string' },
};

const PREVIEW_SCHEMA = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  out: z.string().min(1).optional(),
});

const APPLY_OPTIONS = {
  plan: { type: 'string' },
};

const APPLY_SCHEMA = z.object({
  plan: z.string().min(1),
});

export default async function handleSettle({
  options,
  args,
}: {
  readonly options: CliOptions;
  readonly args: string[];
}): Promise<{
  readonly payload: McpJsonValue;
  readonly human: string;
}> {
  const [subcommand, ...subcommandArgs] = args;
  if (subcommand === 'preview') {
    return await previewSettlement(options, subcommandArgs);
  }
  if (subcommand === 'apply') {
    return await applySettlement(options, subcommandArgs);
  }
  throw usageError('Usage: git warp settle <preview|apply> [options]');
}

async function previewSettlement(
  options: CliOptions,
  args: readonly string[],
): Promise<{
  readonly payload: McpJsonValue;
  readonly human: string;
}> {
  const { values } = parseCommandArgs(
    args,
    PREVIEW_OPTIONS,
    PREVIEW_SCHEMA,
  );
  const selector = settlementSelector(options, values);
  const preview = await withRuntime(
    options,
    async (runtime) => await previewReviewedSettlement(runtime, selector),
  );
  const result = previewResult(preview, selector);
  if (values.out !== undefined) {
    writeFileSync(values.out, `${stableStringify(result.payload)}\n`);
  }
  return result;
}

function previewResult(
  preview: SettlementPreview,
  selector: SettlementSelector,
) {
  const payload: McpJsonValue = Object.freeze({
    type: 'SettlementPreview',
    selector,
    operation: preview.operation,
    source: toMcpJson(preview.source),
    target: toMcpJson(preview.target),
    plan: toMcpJson(preview.plan),
    outcome: toMcpJson(preview.outcome),
    evidence: toMcpJson(preview.evidence),
  });
  return {
    payload,
    human: [
      `Settlement preview: ${preview.source.name} -> ${preview.target.name}`,
      `outcome: ${preview.outcome.kind}`,
      `plan: ${preview.plan.planDigest}`,
    ].join('\n'),
  };
}

function settlementSelector(
  options: CliOptions,
  values: Readonly<{ readonly source: string; readonly target: string }>,
): SettlementSelector {
  return Object.freeze({
    sourceLane: values.source,
    sourceStrand: requireSourceStrand(options.strand),
    targetLane: values.target,
  });
}

async function applySettlement(
  options: CliOptions,
  args: readonly string[],
): Promise<{
  readonly payload: McpJsonValue;
  readonly human: string;
}> {
  const { values } = parseCommandArgs(
    args,
    APPLY_OPTIONS,
    APPLY_SCHEMA,
  );
  const parsed = parseMcpJson(
    JSON.parse(readFileSync(values.plan, 'utf8')),
  );
  const reviewed = reviewedSettlementFromValue(parsed);
  const receipt = await withRuntime(
    options,
    async (runtime) => await applyReviewedSettlement(runtime, reviewed),
  );
  const payload = receiptEnvelope(receipt);
  return {
    payload,
    human: renderReceipt(payload),
  };
}

function requireSourceStrand(strand: string | null): string {
  if (strand === null || strand.length === 0) {
    throw usageError('--strand <name> is required for settlement preview');
  }
  return strand;
}
