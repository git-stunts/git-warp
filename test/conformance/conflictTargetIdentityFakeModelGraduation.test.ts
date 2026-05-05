import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Dot } from '../../src/domain/crdt/Dot.ts';
import {
  buildTargetIdentity,
  normalizeConflictOp,
  normalizeEffectPayload,
} from '../../src/domain/services/strand/conflictTargetIdentity.ts';
import NodeAdd from '../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../src/domain/types/ops/NodePropSet.ts';
import PropSet from '../../src/domain/types/ops/PropSet.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CONFLICT_TARGET_IDENTITY_PATH = 'src/domain/services/strand/conflictTargetIdentity.ts';
const FAKE_MODEL_MANIFEST_PATH = 'policy/quarantines/0025C-fake-models.json';

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

describe('conflict target identity fake-model graduation', () => {
  it('removes conflictTargetIdentity from the 0025C fake-model quarantine', () => {
    const manifest = readRepoFile(FAKE_MODEL_MANIFEST_PATH);

    expect(manifest).not.toContain(`"${CONFLICT_TARGET_IDENTITY_PATH}"`);
  });

  it('keeps the conflict target identity source free of project *Like placeholders', () => {
    const source = readRepoFile(CONFLICT_TARGET_IDENTITY_PATH);

    expect(source).not.toMatch(/\b[A-Z][A-Za-z0-9]*Like\b/u);
  });

  it('normalizes raw property ops into runtime-backed canonical conflict ops', () => {
    const rawOp = new PropSet('node-a', 'color', 'blue');

    const canonicalOp = normalizeConflictOp(rawOp);

    expect(canonicalOp).toBeInstanceOf(NodePropSet);
    if (canonicalOp instanceof NodePropSet) {
      expect(buildTargetIdentity(canonicalOp, '*')).toEqual({
        targetKind: 'node_property',
        entityId: 'node-a',
        propertyKey: 'color',
      });
      expect(normalizeEffectPayload(canonicalOp)).toEqual({ value: 'blue' });
    }
  });

  it('keeps add effects on the runtime Dot instance instead of cloning op-shaped bags', () => {
    const rawOp = new NodeAdd('node-a', new Dot('writer-a', 1));

    const canonicalOp = normalizeConflictOp(rawOp);

    expect(normalizeEffectPayload(canonicalOp)).toEqual({
      dot: new Dot('writer-a', 1),
    });
  });
});
