import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const DESIGN_PATH = 'docs/design/0098-btr-signing-bytes-layer-ownership.md';
const GUIDE_PATH = 'docs/method/refactoring-guides/anti-sludge-refactoring-guide.md';
const SLUDGE_MAP_PATH = 'policy/sludge/sludge-map.json';

const BTR_SIGNING_BYTES = 'BtrSigningBytes';

type ProposedNoun = {
  readonly name?: string;
  readonly constructs?: string;
  readonly consumes?: string;
  readonly layer?: string;
};

type SludgeFinding = {
  readonly proposed_nouns?: readonly ProposedNoun[];
};

type SludgeFamily = {
  readonly findings?: readonly SludgeFinding[];
};

type SludgeMap = {
  readonly families?: readonly SludgeFamily[];
};

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function readSludgeMap(): SludgeMap {
  return JSON.parse(readRepoFile(SLUDGE_MAP_PATH)) as SludgeMap;
}

function allProposedNouns(sludgeMap: SludgeMap): readonly ProposedNoun[] {
  return (sludgeMap.families ?? [])
    .flatMap((family) => family.findings ?? [])
    .flatMap((finding) => finding.proposed_nouns ?? []);
}

function btrSigningBytesNouns(): readonly ProposedNoun[] {
  return allProposedNouns(readSludgeMap())
    .filter((noun) => noun.name === BTR_SIGNING_BYTES);
}

function normalized(value: string | undefined): string {
  return value?.toLowerCase() ?? '';
}

describe('BTR signing-byte ownership doctrine', () => {
  it('records the ownership decision in the 0098 design doc', () => {
    const design = readRepoFile(DESIGN_PATH);

    expect(design).toContain('`BtrSigningEnvelope` is owned by `domain`.');
    expect(design).toContain('`BtrSigningBytes` is owned by `domain`.');
    expect(design).toMatch(/`BoundaryTransitionRecordCodecPort` is a\s+port capability/);
    expect(design).toContain('Canonical BTR signing encoding happens in the adapter implementing');
    expect(design).toContain('The crypto/HMAC use-case consumes `BtrSigningBytes`.');
    expect(design).toContain('Ports define capabilities');
    expect(design).toContain('A port does not own the values that cross');
  });

  it('requires BtrSigningBytes to exist as a proposed sludge-map noun', () => {
    expect(btrSigningBytesNouns().length).toBeGreaterThan(0);
  });

  it('requires BtrSigningBytes to be a domain value, not a ports noun', () => {
    for (const noun of btrSigningBytesNouns()) {
      expect(noun.layer).toBe('domain');
      expect(noun.layer).not.toBe('ports');
    }
  });

  it('requires the construction proof to name the codec port and adapter', () => {
    for (const noun of btrSigningBytesNouns()) {
      const constructs = normalized(noun.constructs);

      expect(noun.constructs).toContain('BoundaryTransitionRecordCodecPort');
      expect(constructs).toContain('adapter');
    }
  });

  it('requires the consumption proof to name HMAC and CryptoPort', () => {
    for (const noun of btrSigningBytesNouns()) {
      const consumes = normalized(noun.consumes);

      expect(consumes).toContain('hmac');
      expect(noun.consumes).toContain('CryptoPort');
    }
  });

  it('teaches that ports define capabilities but do not own returned values', () => {
    const guide = readRepoFile(GUIDE_PATH);

    expect(guide).toContain('Ports define capabilities; they do not own the values they return.');
  });

  it('guards against canonical-byte cosplay from arbitrary raw bytes', () => {
    const design = readRepoFile(DESIGN_PATH);

    expect(design).toContain(
      'BtrSigningBytes must not be constructible from arbitrary raw bytes outside the canonical BTR signing encoder path.',
    );
  });
});
