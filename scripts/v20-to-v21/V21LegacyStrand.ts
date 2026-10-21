/**
 * A pre-worldline (v19/v20, schema 1) strand descriptor, read only by the
 * v20-to-v21 migration (#1015). The v21 runtime never decodes this shape.
 */
export type V21LegacyQueuedIntent = Readonly<{
  /** The raw JSON bag, translated field by field and re-stored. */
  raw: Readonly<Record<string, unknown>>;
}>;

export type V21LegacyReadOverlay = Readonly<{
  strandId: string;
  headPatchSha: string | null;
}>;

export type V21LegacyStrand = Readonly<{
  name: string;
  descriptorSha: string;
  owner: string | null;
  scope: string | null;
  createdAt: string;
  updatedAt: string;
  leaseExpiresAt: string | null;
  baseObservation: Readonly<{
    coordinateVersion: string;
    frontier: Readonly<Record<string, string>>;
    frontierDigest: string;
    lamportCeiling: number | null;
    checkpointSha: string | null;
  }>;
  overlayKind: string;
  writable: boolean;
  readOverlays: readonly V21LegacyReadOverlay[];
  nextIntentSeq: number;
  intents: readonly V21LegacyQueuedIntent[];
  evolution: Readonly<Record<string, unknown>> | null;
}>;

type Bag = Readonly<Record<string, unknown>>;

/** Parses the legacy descriptor JSON, refusing anything but schema 1. */
export function parseV21LegacyStrand(name: string, descriptorSha: string, text: string): V21LegacyStrand {
  const raw = bag(JSON.parse(text), `strand '${name}'`);
  if (raw['schemaVersion'] !== 1 || raw['strandId'] !== name) {
    throw new Error(`strand '${name}' is not a schema 1 descriptor for that name`);
  }
  const base = bag(raw['baseObservation'], `strand '${name}' baseObservation`);
  const overlay = bag(raw['overlay'], `strand '${name}' overlay`);
  const braid = raw['braid'] === undefined ? {} : bag(raw['braid'], `strand '${name}' braid`);
  const queue = raw['intentQueue'] === undefined ? {} : bag(raw['intentQueue'], `strand '${name}' intentQueue`);
  return Object.freeze({
    name,
    descriptorSha,
    owner: nullableString(raw['owner']),
    scope: nullableString(raw['scope']),
    createdAt: requiredString(raw['createdAt'], 'createdAt'),
    updatedAt: requiredString(raw['updatedAt'], 'updatedAt'),
    leaseExpiresAt: nullableString(bag(raw['lease'] ?? {}, 'lease')['expiresAt']),
    baseObservation: Object.freeze({
      coordinateVersion: requiredString(base['coordinateVersion'], 'coordinateVersion'),
      frontier: stringRecord(base['frontier']),
      frontierDigest: requiredString(base['frontierDigest'], 'frontierDigest'),
      lamportCeiling: typeof base['lamportCeiling'] === 'number' ? base['lamportCeiling'] : null,
      checkpointSha: nullableString(base['checkpointSha']),
    }),
    overlayKind: requiredString(overlay['kind'], 'overlay.kind'),
    writable: overlay['writable'] !== false,
    readOverlays: readOverlaysOf(braid['readOverlays']),
    nextIntentSeq: typeof queue['nextIntentSeq'] === 'number' ? queue['nextIntentSeq'] : 1,
    intents: Array.isArray(queue['intents'])
      ? queue['intents'].map((intent) => Object.freeze({ raw: bag(intent, `strand '${name}' intent`) }))
      : [],
    evolution: raw['evolution'] === undefined ? null : bag(raw['evolution'], 'evolution'),
  });
}

function readOverlaysOf(value: unknown): V21LegacyReadOverlay[] {
  if (!Array.isArray(value)) { return []; }
  return value.map((entry) => {
    const overlay = bag(entry, 'braid.readOverlays[]');
    return Object.freeze({
      strandId: requiredString(overlay['strandId'], 'readOverlays[].strandId'),
      headPatchSha: nullableString(overlay['headPatchSha']),
    });
  });
}

function bag(value: unknown, label: string): Bag {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as Bag;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) { throw new Error(`legacy descriptor is missing ${label}`); }
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stringRecord(value: unknown): Readonly<Record<string, string>> {
  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(bag(value, 'baseObservation.frontier'))) {
    if (typeof entry === 'string') { record[key] = entry; }
  }
  return Object.freeze(record);
}
