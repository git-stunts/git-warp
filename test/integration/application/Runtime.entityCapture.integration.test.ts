import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Runtime } from '../../../index.ts';
import Intent from '../../../src/domain/api/Intent.ts';
import { intentFromPatch } from '../../../src/domain/api/IntentRuntime.ts';
import type WarpState from '../../../src/domain/services/state/WarpState.ts';
import type { PropValue } from '../../../src/domain/types/PropValue.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

const LANE = 'think';
const WRITER = 'claude';

const MEMORY = {
  ambientGitBranch: 'feature/git-warp-v19-cutover',
  ambientGitRemote: 'git@github.com:flyingrobots/think.git',
  createdAt: '2026-08-01T05:13:00.000Z',
  kind: 'capture',
  schemaVersion: 1,
  sortKey: '1785597386985-c538d1bd',
  text: 'probe write two',
};

describe('Runtime entity capture provenance', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;

  beforeEach(async () => {
    repository = await createTestRepo('runtime-entity-capture');
  });

  afterEach(async () => {
    await repository.cleanup();
  });

  it('survives a reopen and answers provenance with exactly its own creation evidence', async () => {
    await captureEntities(['entry:1', 'entry:2', 'entry:3']);

    // Reopened from disk: nothing below reuses the writing Runtime's memory.
    const graph = await repository.openGraph(LANE, WRITER);
    await graph.materialize();

    const cone = await graph.patchesFor('entry:2');
    expect(cone).toHaveLength(1);

    const [creationSha = ''] = cone;
    const persisted = await graph.loadPatchBySha(creationSha);
    expect(persisted.reads).toBeUndefined();
    expect(persisted.writes).toEqual(['entry:2']);
    expect(persisted.ops).toHaveLength(1 + Object.keys(MEMORY).length);

    // The persisted patch still reads back as the entity Intent that wrote it.
    expect(intentFromPatch(persisted).descriptor).toEqual({
      kind: 'entity.add',
      subject: 'entry:2',
      properties: { ...MEMORY },
    });

    // The slice replays the whole entity from that one patch alone.
    const slice = await graph.materializeSlice('entry:2');
    expect(slice.patchCount).toBe(1);
    expect(slice.state.nodeAlive.contains('entry:2')).toBe(true);
    expect(propertiesOf(slice.state, 'entry:2')).toEqual({ ...MEMORY });

    // Membership is not causation: the siblings are absent from this cone.
    expect(slice.state.nodeAlive.contains('entry:1')).toBe(false);
    expect(slice.state.nodeAlive.contains('entry:3')).toBe(false);
  });

  it('gives every capture a singleton cone, however many precede it', async () => {
    const subjects = ['entry:1', 'entry:2', 'entry:3', 'entry:4', 'entry:5'];
    await captureEntities(subjects);

    const graph = await repository.openGraph(LANE, WRITER);
    await graph.materialize();

    const cones = new Map<string, string[]>();
    for (const subject of subjects) {
      cones.set(subject, await graph.patchesFor(subject));
    }

    // Cost tracks the query, not the history: the last capture costs what the
    // first one costs.
    expect([...cones.values()].map((cone) => cone.length)).toEqual([1, 1, 1, 1, 1]);

    // Cone is a strict subset of the universe: five captures, five distinct
    // patches, and no cone names a patch belonging to another entity.
    const shas = [...cones.values()].flat();
    expect(new Set(shas).size).toBe(subjects.length);

    for (const subject of subjects) {
      const slice = await graph.materializeSlice(subject);
      expect(slice.patchCount).toBe(1);
      expect(propertiesOf(slice.state, subject)).toEqual({ ...MEMORY });
    }
  });

  async function captureEntities(subjects: readonly string[]): Promise<void> {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: WRITER });
    try {
      const lane = await runtime.lane(LANE);
      for (const subject of subjects) {
        await lane.write(Intent.addEntity({ subject, properties: { ...MEMORY } }));
      }
    } finally {
      await runtime.close();
    }
  }
});

function propertiesOf(state: WarpState, nodeId: string): Record<string, PropValue> {
  const properties: Record<string, PropValue> = {};
  for (const entry of state.nodeProperties()) {
    if (entry.nodeId === nodeId) {
      properties[entry.key] = entry.register.value;
    }
  }
  return properties;
}
