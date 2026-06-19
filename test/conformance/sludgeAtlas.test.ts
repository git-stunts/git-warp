import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import sludgeMap from '../../policy/sludge/sludge-map.json' with { type: 'json' };
import sludgeMapJsonSchema from '../../policy/sludge/sludge-map.schema.json' with { type: 'json' };

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

const nonEmptyString = z.string().trim().min(1);

const proposedNounSchema = z.object({
  name: nonEmptyString,
  constructs: nonEmptyString,
  consumes: nonEmptyString,
  proves_invariant: nonEmptyString,
  layer: z.enum(['domain', 'ports', 'policy']),
  eliminates: nonEmptyString,
}).strict();

const findingSchema = z.object({
  path: nonEmptyString,
  lines: z.array(z.number().int().positive()).min(1).optional(),
  symptom: nonEmptyString,
  root_cause: nonEmptyString,
  recommended_fix: nonEmptyString,
  blocks: z.array(nonEmptyString),
  proposed_nouns: z.array(proposedNounSchema).min(1).optional(),
}).strict();

const familySchema = z.object({
  id: nonEmptyString,
  label: nonEmptyString,
  severity: z.enum(['release-blocking', 'watch']),
  blocks: z.array(nonEmptyString),
  findings: z.array(findingSchema).min(1),
}).strict();

const sludgeMapSchema = z.object({
  generated_for_cycle: nonEmptyString,
  source_cycle_blocked: nonEmptyString,
  families: z.array(familySchema).min(1),
  dependency_order: z.array(nonEmptyString).optional(),
}).strict();

type SludgeMap = z.infer<typeof sludgeMapSchema>;
type SludgeFinding = z.infer<typeof findingSchema>;

const atlas: SludgeMap = sludgeMapSchema.parse(sludgeMap);

class SludgeAtlasTestError extends Error {}

function allFindings(map: SludgeMap): readonly SludgeFinding[] {
  return map.families?.flatMap((family) => family.findings ?? []) ?? [];
}

function assertNonEmptyString(value: string | undefined, field: string): void {
  expect(value, field).toEqual(expect.any(String));
  expect(value?.trim(), field).not.toHaveLength(0);
}

describe('sludge atlas contract', () => {
  it('publishes a formal schema for the sludge map', () => {
    expect(sludgeMapJsonSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(sludgeMapJsonSchema.$id).toBe('https://git-stunts.dev/git-warp/schemas/sludge-map.schema.json');
    expect(sludgeMapJsonSchema.additionalProperties).toBe(false);
    expect(sludgeMapJsonSchema.required).toEqual(['generated_for_cycle', 'source_cycle_blocked', 'families']);
    expect(sludgeMapJsonSchema.$defs.proposedNoun.properties.layer.enum)
      .toEqual(['domain', 'ports', 'policy']);
  });

  it('validates the sludge map against the strict runtime schema', () => {
    expect(() => sludgeMapSchema.parse(sludgeMap)).not.toThrow();
  });

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
