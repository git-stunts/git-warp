import { openGraph } from '../shared.ts';
import type { CliOptions } from '../types.ts';

export type MaterializationRepairPayload = Readonly<{
  readonly type: 'Repair';
  readonly action: 'materialization';
  readonly lane: string;
  readonly status: 'completed';
}>;

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
