import { describe, expect, it } from 'vitest';

import sludgeMap from '../../policy/sludge/sludge-map.json' with { type: 'json' };

const REQUIRED_FAMILY_IDS = Object.freeze([
  'cast-theater',
  'boundary-leakage',
  'anonymous-bag-models',
  'canonical-byte-violations',
  'port-impersonation',
  'generic-preservation-lies',
  'default-behavior-bugs',
]);

const REQUIRED_FINDING_PATHS = Object.freeze([
  'src/domain/services/provenance/BTR.ts',
  'src/domain/services/provenance/btrOperations.ts',
  'src/domain/services/ImmutableSnapshot.ts',
  'src/domain/services/index/PropertyIndexReader.ts',
]);

type SludgeFinding = {
  readonly path?: string;
  readonly symptom?: string;
  readonly root_cause?: string;
  readonly recommended_fix?: string;
  readonly blocks?: readonly string[];
  readonly proposed_nouns?: readonly ProposedNoun[];
};

type ProposedNoun = {
  readonly name?: string;
  readonly constructs?: string;
  readonly consumes?: string;
  readonly proves_invariant?: string;
  readonly layer?: string;
  readonly eliminates?: string;
};

type SludgeFamily = {
  readonly id?: string;
  readonly findings?: readonly SludgeFinding[];
};

type SludgeMap = {
  readonly source_cycle_blocked?: string;
  readonly families?: readonly SludgeFamily[];
};

const atlas: SludgeMap = sludgeMap;

class SludgeAtlasTestError extends Error {}

function allFindings(map: SludgeMap): readonly SludgeFinding[] {
  return map.families?.flatMap((family) => family.findings ?? []) ?? [];
}

function assertNonEmptyString(value: string | undefined, field: string): void {
  expect(value, field).toEqual(expect.any(String));
  expect(value?.trim(), field).not.toHaveLength(0);
}

describe('sludge atlas contract', () => {
  it('publishes structured release-blocking families for the blocked cycle', () => {
    const familyIds = new Set((atlas.families ?? []).map((family) => family.id));

    expect(atlas.source_cycle_blocked).toBe('0096-purge-cast-hacks');
    for (const familyId of REQUIRED_FAMILY_IDS) {
      expect(familyIds.has(familyId), familyId).toBe(true);
    }
  });

  it('includes structured findings for required source paths', () => {
    const findingPaths = new Set(allFindings(atlas).map((finding) => finding.path));

    for (const path of REQUIRED_FINDING_PATHS) {
      expect(findingPaths.has(path), path).toBe(true);
    }
  });

  it('gives every finding a concrete diagnosis and recommended repair', () => {
    for (const finding of allFindings(atlas)) {
      assertNonEmptyString(finding.path, 'path');
      assertNonEmptyString(finding.symptom, `${finding.path}: symptom`);
      assertNonEmptyString(finding.root_cause, `${finding.path}: root_cause`);
      assertNonEmptyString(finding.recommended_fix, `${finding.path}: recommended_fix`);
    }
  });

  it('marks cast-purge blockers explicitly', () => {
    const blockedCycle = atlas.source_cycle_blocked;
    if (blockedCycle === undefined) {
      throw new SludgeAtlasTestError('expected blocked cycle');
    }
    const blockingFindings = allFindings(atlas)
      .filter((finding) => finding.blocks?.includes(blockedCycle) === true);

    expect(blockingFindings.length).toBeGreaterThan(0);
    for (const finding of blockingFindings) {
      expect(finding.blocks?.includes(blockedCycle)).toBe(true);
    }
  });

  it('requires proposed nouns to state ownership, invariant, and eliminated sludge', () => {
    const findingsWithNouns = allFindings(atlas)
      .filter((finding) => (finding.proposed_nouns ?? []).length > 0);

    expect(findingsWithNouns.length).toBeGreaterThan(0);
    for (const finding of findingsWithNouns) {
      for (const noun of finding.proposed_nouns ?? []) {
        assertNonEmptyString(noun.name, `${finding.path}: proposed_noun.name`);
        assertNonEmptyString(noun.constructs, `${finding.path}: proposed_noun.constructs`);
        assertNonEmptyString(noun.consumes, `${finding.path}: proposed_noun.consumes`);
        assertNonEmptyString(noun.proves_invariant, `${finding.path}: proposed_noun.proves_invariant`);
        assertNonEmptyString(noun.layer, `${finding.path}: proposed_noun.layer`);
        assertNonEmptyString(noun.eliminates, `${finding.path}: proposed_noun.eliminates`);
      }
    }
  });
});
