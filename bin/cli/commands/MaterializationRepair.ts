import { openGraph } from '../shared.ts';
import type { CliOptions } from '../types.ts';

export type MaterializationRepairPayload = Readonly<{
  readonly type: 'Repair';
  readonly action: 'materialization';
  readonly lane: string;
  readonly status: 'completed';
}>;

/**
 * Global maintenance (#1039): reduces the whole graph state and writes a
 * whole-state checkpoint. No public read, write, fork or settlement needs
 * it; it serves migration, export and inspection, and its cost grows with
 * the whole graph.
 */
export default async function prepareMaterialization(
  options: CliOptions,
  lane: string,
): Promise<MaterializationRepairPayload> {
  const { graph } = await openGraph(options);
  await graph.materialize();
  await graph.createCheckpoint();
  return Object.freeze({
    type: 'Repair',
    action: 'materialization',
    lane,
    status: 'completed',
  });
}
