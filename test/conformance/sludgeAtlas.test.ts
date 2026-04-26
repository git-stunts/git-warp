import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const SLUDGE_MAP_PATH = 'policy/sludge/sludge-map.json';
const GUIDE_PATH = 'docs/method/refactoring-guides/anti-sludge-refactoring-guide.md';
const DESIGN_PATH = 'docs/design/0097-sludge-atlas-and-refactor-guide.md';

const REQUIRED_FAMILY_IDS = [
  'cast-theater',
  'boundary-leakage',
  'anonymous-bag-models',
  'canonical-byte-violations',
  'port-impersonation',
  'generic-preservation-lies',
  'default-behavior-bugs',
] as const;

const REQUIRED_FINDING_PATHS = [
  'src/domain/services/provenance/BTR.ts',
  'src/domain/services/provenance/btrOperations.ts',
  'src/domain/services/ImmutableSnapshot.ts',
  'src/domain/services/index/PropertyIndexReader.ts',
] as const;

const REQUIRED_GUIDE_SECTIONS = [
  'Anti-pattern: Cast Theater',
  'Anti-pattern: Boundary Leakage',
  'Anti-pattern: Anonymous Bag Models',
  'Anti-pattern: Canonical Byte Violations',
  'Anti-pattern: Port Impersonation',
  'Anti-pattern: Generic Preservation Lies',
  'Anti-pattern: Default Behavior Bugs',
] as const;

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

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function readSludgeMap(): SludgeMap {
  return JSON.parse(readRepoFile(SLUDGE_MAP_PATH)) as SludgeMap;
}

function allFindings(sludgeMap: SludgeMap): readonly SludgeFinding[] {
  return sludgeMap.families?.flatMap((family) => family.findings ?? []) ?? [];
}

function assertNonEmptyString(value: string | undefined, field: string): void {
  expect(value, field).toEqual(expect.any(String));
  expect(value?.trim(), field).not.toHaveLength(0);
}

describe('sludge atlas contract', () => {
  it('parses the sludge map and points back to the blocked source cycle', () => {
    const sludgeMap = readSludgeMap();

    expect(sludgeMap.source_cycle_blocked).toBe('0096-purge-cast-hacks');
  });

  it('includes the required sludge families', () => {
    const sludgeMap = readSludgeMap();
    const familyIds = new Set((sludgeMap.families ?? []).map((family) => family.id));

    for (const familyId of REQUIRED_FAMILY_IDS) {
      expect(familyIds.has(familyId), familyId).toBe(true);
    }
  });

  it('includes findings for the required source paths', () => {
    const sludgeMap = readSludgeMap();
    const findingPaths = new Set(allFindings(sludgeMap).map((finding) => finding.path));

    for (const path of REQUIRED_FINDING_PATHS) {
      expect(findingPaths.has(path), path).toBe(true);
    }
  });

  it('gives every finding a concrete diagnosis and recommended repair', () => {
    const sludgeMap = readSludgeMap();

    for (const finding of allFindings(sludgeMap)) {
      assertNonEmptyString(finding.path, 'path');
      assertNonEmptyString(finding.symptom, `${finding.path}: symptom`);
      assertNonEmptyString(finding.root_cause, `${finding.path}: root_cause`);
      assertNonEmptyString(finding.recommended_fix, `${finding.path}: recommended_fix`);
    }
  });

  it('marks cast-purge blockers explicitly', () => {
    const sludgeMap = readSludgeMap();
    const blockingFindings = allFindings(sludgeMap)
      .filter((finding) => finding.blocks?.includes('0096-purge-cast-hacks') === true);

    expect(blockingFindings.length).toBeGreaterThan(0);
    for (const finding of blockingFindings) {
      expect(finding.blocks).toContain('0096-purge-cast-hacks');
    }
  });

  it('requires proposed nouns to state ownership, invariant, and eliminated sludge', () => {
    const sludgeMap = readSludgeMap();
    const findingsWithNouns = allFindings(sludgeMap)
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

  it('keeps the refactoring guide anchored to required anti-patterns', () => {
    const guide = readRepoFile(GUIDE_PATH);

    for (const section of REQUIRED_GUIDE_SECTIONS) {
      expect(guide).toContain(section);
    }
  });

  it('states that implementation follows dependency order instead of grep order', () => {
    const design = readRepoFile(DESIGN_PATH);

    expect(design).toContain('dependency order instead of grep order');
  });
});
