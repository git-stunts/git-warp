import { describe, it, expect, vi, beforeEach } from 'vitest';
import StrandService, {
  STRAND_SCHEMA_VERSION,
  STRAND_COORDINATE_VERSION,
  STRAND_OVERLAY_KIND,
  STRAND_INTENT_ID_WIDTH,
  STRAND_TICK_ID_WIDTH,
  STRAND_COUNTERFACTUAL_REASON,
} from '../../../../../src/domain/services/strand/StrandService.js';
import StrandError from '../../../../../src/domain/errors/StrandError.js';
import { textEncode, textDecode } from '../../../../../src/domain/utils/bytes.js';
import { createEmptyStateV5 } from '../../../../../src/domain/services/JoinReducer.js';

// ── Deterministic OID generator ───────────────────────────────────────────────

let oidCounter = 0;
function nextOid() {
  oidCounter += 1;
  return String(oidCounter).padStart(40, '0');
}

// ── Clock counter for deterministic timestamps ────────────────────────────────

let clockCounter = 0;
function nextTimestamp() {
  clockCounter += 1;
  return `2026-04-06T00:00:${String(clockCounter).padStart(2, '0')}.000Z`;
}

// ── Mock graph factory ────────────────────────────────────────────────────────

/** @type {Map<string, string>} ref store: ref path -> oid */
let refs;
/** @type {Map<string, Uint8Array>} blob store: oid -> bytes */
let blobs;
/** @type {Map<string, Array<{patch: object, sha: string}>>} sha -> patch chain */
let patchChains;

/**
 * Build a descriptor JSON that parseStrandBlob will accept.
 */
function buildValidDescriptor(overrides = {}) {
  return {
    schemaVersion: 1,
    strandId: 'test-strand',
    graphName: 'test-graph',
    createdAt: '2026-04-06T00:00:00.000Z',
    updatedAt: '2026-04-06T00:00:00.000Z',
    owner: null,
    scope: null,
    lease: { expiresAt: null },
    baseObservation: {
      coordinateVersion: STRAND_COORDINATE_VERSION,
      frontier: { writer1: 'tip-sha-1' },
      frontierDigest: 'digest-abc',
      lamportCeiling: null,
    },
    overlay: {
      overlayId: 'test-strand',
      kind: STRAND_OVERLAY_KIND,
      headPatchSha: null,
      patchCount: 0,
      writable: true,
    },
    braid: { readOverlays: [] },
    materialization: { cacheAuthority: 'derived' },
    ...overrides,
  };
}

function storeDescriptor(descriptor) {
  const oid = nextOid();
  blobs.set(oid, textEncode(JSON.stringify(descriptor)));
  const refPath = `refs/warp/test-graph/strands/${descriptor.strandId}`;
  refs.set(refPath, oid);
  return oid;
}

function createMockGraph() {
  refs = new Map();
  blobs = new Map();
  patchChains = new Map();
  oidCounter = 0;
  clockCounter = 0;

  return {
    _graphName: 'test-graph',
    _persistence: {
      readRef: vi.fn(async (ref) => refs.get(ref) ?? null),
      updateRef: vi.fn(async (ref, oid) => { refs.set(ref, oid); }),
      deleteRef: vi.fn(async (ref) => { refs.delete(ref); }),
      writeBlob: vi.fn(async (/** @type {Uint8Array} */ data) => {
        const oid = nextOid();
        blobs.set(oid, data);
        return oid;
      }),
      readBlob: vi.fn(async (oid) => blobs.get(oid) ?? null),
      listRefs: vi.fn(async (prefix) => {
        return [...refs.keys()].filter((ref) => ref.startsWith(prefix));
      }),
      writeTree: vi.fn(async () => nextOid()),
      commitNodeWithTree: vi.fn(async () => nextOid()),
    },
    _crypto: {
      hash: vi.fn(async (_algo, data) => `sha256:${typeof data === 'string' ? data.slice(0, 16) : 'bytes'}`),
    },
    _clock: {
      timestamp: vi.fn(() => nextTimestamp()),
    },
    _cachedState: null,
    _patchInProgress: false,
    _maxObservedLamport: 0,
    _stateDirty: false,
    _cachedViewHash: null,
    _cachedCeiling: null,
    _cachedFrontier: null,
    _provenanceIndex: null,
    _provenanceDegraded: true,
    _patchJournal: null,
    _logger: null,
    _blobStorage: null,
    _patchBlobStorage: null,
    _codec: { encode: vi.fn((patch) => textEncode(JSON.stringify(patch))) },
    _onDeleteWithData: undefined,
    _lastFrontier: new Map(),
    _writerId: 'writer1',
    getFrontier: vi.fn(async () => new Map([['writer1', 'tip-sha-1']])),
    _loadPatchChainFromSha: vi.fn(async (sha) => patchChains.get(sha) ?? []),
    _setMaterializedState: vi.fn(async () => {}),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StrandService', () => {
  /** @type {ReturnType<typeof createMockGraph>} */
  let graph;
  /** @type {StrandService} */
  let service;

  beforeEach(() => {
    graph = createMockGraph();
    service = new StrandService({ graph });
  });

  // ── Exported constants ────────────────────────────────────────────────────

  describe('exported constants', () => {
    it('exports STRAND_SCHEMA_VERSION as 1', () => {
      expect(STRAND_SCHEMA_VERSION).toBe(1);
    });

    it('exports STRAND_COORDINATE_VERSION', () => {
      expect(STRAND_COORDINATE_VERSION).toBe('frontier-lamport/v1');
    });

    it('exports STRAND_OVERLAY_KIND', () => {
      expect(STRAND_OVERLAY_KIND).toBe('patch-log');
    });

    it('exports STRAND_INTENT_ID_WIDTH as 4', () => {
      expect(STRAND_INTENT_ID_WIDTH).toBe(4);
    });

    it('exports STRAND_TICK_ID_WIDTH as 4', () => {
      expect(STRAND_TICK_ID_WIDTH).toBe(4);
    });

    it('exports STRAND_COUNTERFACTUAL_REASON', () => {
      expect(STRAND_COUNTERFACTUAL_REASON).toBe('footprint_overlap');
    });
  });

  // ── Constructor ───────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('stores the graph reference', () => {
      expect(service._graph).toBe(graph);
    });

    it('wires a descriptor store boundary', () => {
      expect(service._descriptorStore).toBeTruthy();
    });

    it('wires a patch service boundary', () => {
      expect(service._patchService).toBeTruthy();
    });

    it('wires an intent service boundary', () => {
      expect(service._intentService).toBeTruthy();
    });
  });

  describe('descriptor store seam', () => {
    it('reads overlay metadata directly from the descriptor store', async () => {
      const metadata = await service._descriptorStore.readOverlayMetadata('alpha');

      expect(metadata).toEqual({ headPatchSha: null, patchCount: 0 });
    });

    it('normalizes missing queue and evolution records to empty defaults', () => {
      expect(service._descriptorStore.normalizeIntentQueue(null)).toEqual({
        nextIntentSeq: 1,
        intents: [],
      });
      expect(service._descriptorStore.normalizeEvolution(undefined)).toEqual({
        tickCount: 0,
        lastTick: null,
      });
    });

    it('drops malformed queued intent entries at the descriptor boundary', () => {
      expect(service._descriptorStore._normalizeQueuedIntentEntry(null)).toEqual([]);
      expect(service._descriptorStore._normalizeQueuedIntentEntry({
        intentId: 'alpha.intent.0001',
        enqueuedAt: '2026-04-06T00:00:00.000Z',
      })).toEqual([]);
      expect(service._descriptorStore._resolveQueuedIntentIdentity({
        intentId: 'alpha.intent.0001',
        enqueuedAt: '2026-04-06T00:00:00.000Z',
      })).toBeNull();
    });

    it('returns empty collections for non-array descriptor fields', () => {
      expect(service._descriptorStore._normalizeQueuedIntents(null)).toEqual([]);
      expect(service._descriptorStore._normalizeRejectedCounterfactuals(undefined)).toEqual([]);
    });

    it('treats missing braid overlays as an empty normalized list', async () => {
      const hydrated = await service._descriptorStore.hydrateDescriptor(buildValidDescriptor({
        strandId: 'alpha',
        braid: /** @type {unknown} */ ({}),
      }));

      expect(hydrated.braid.readOverlays).toEqual([]);
    });

    it('returns false when hydrated overlay comparison sees a sparse candidate slot', () => {
      const descriptor = buildValidDescriptor({
        strandId: 'alpha',
        braid: {
          readOverlays: [{
            strandId: 'beta',
            overlayId: 'beta',
            kind: STRAND_OVERLAY_KIND,
            headPatchSha: null,
            patchCount: 0,
          }],
        },
      });

      expect(service._descriptorStore._matchesHydratedDescriptor(
        descriptor,
        new Array(1),
        { headPatchSha: null, patchCount: 0 },
      )).toBe(false);
    });

    it('throws boundary validation errors for invalid descriptor field types', () => {
      expect(() => service._descriptorStore._normalizeRejectedCounterfactuals([{
        intentId: 42,
        reason: 'conflict',
      }])).toThrow(StrandError);

      expect(() => service._descriptorStore._normalizeRejectedCounterfactuals([{
        intentId: 'alpha.intent.0001',
        reason: '   ',
      }])).toThrow(StrandError);
    });
  });

  describe('patch service seam', () => {
    it('builds queued intents through the patch service boundary', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      const intent = await service._patchService.buildQueuedIntent(desc, (builder) => {
        builder.addNode('node:test');
      });

      expect(intent.intentId).toBe('alpha.intent.0001');
      expect(Object.isFrozen(intent)).toBe(true);
    });

    it('normalizes sparse queued intent arrays through the patch service boundary', () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });

      const intent = service._patchService._freezeQueuedIntent(
        desc,
        { nextIntentSeq: 1, intents: [] },
        {
          build: () => ({
            schema: 2,
            ops: [{ op: 'NodeAdd', nodeId: 'node:test', dot: ['alpha', 1] }],
            reads: [undefined, 'node:b', 'node:a'],
            writes: [null, 'node:c', 'node:a'],
          }),
          _contentBlobs: [undefined, 'blob:b', 'blob:a'],
        },
      );

      expect(intent.reads).toEqual(['node:a', 'node:b']);
      expect(intent.writes).toEqual(['node:a', 'node:c']);
      expect(intent.contentBlobOids).toEqual(['blob:a', 'blob:b']);
    });

    it('rejects non-string queued intent footprint entries at the patch service boundary', () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });

      expect(() => service._patchService._freezeQueuedIntent(
        desc,
        { nextIntentSeq: 1, intents: [] },
        {
          build: () => ({
            schema: 2,
            ops: [{ op: 'NodeAdd', nodeId: 'node:test', dot: ['alpha', 1] }],
            reads: [42],
            writes: [],
          }),
          _contentBlobs: [],
        },
      )).toThrow(StrandError);
    });

    it('rejects blank queued intent footprint entries at the patch service boundary', () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });

      expect(() => service._patchService._freezeQueuedIntent(
        desc,
        { nextIntentSeq: 1, intents: [] },
        {
          build: () => ({
            schema: 2,
            ops: [{ op: 'NodeAdd', nodeId: 'node:test', dot: ['alpha', 1] }],
            reads: ['   '],
            writes: [],
          }),
          _contentBlobs: [],
        },
      )).toThrow(StrandError);
    });
  });

  describe('intent service seam', () => {
    it('classifies overlapping intents through the intent service boundary', () => {
      const { admitted, rejected } = service._intentService.classifyQueuedIntents([
        { intentId: 'i1', reads: ['a'], writes: ['shared'], patch: {}, enqueuedAt: '', contentBlobOids: [] },
        { intentId: 'i2', reads: ['shared'], writes: ['b'], patch: {}, enqueuedAt: '', contentBlobOids: [] },
      ]);

      expect(admitted).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].conflictsWith).toEqual(['i1']);
    });
  });

  // ── create ──────────────────────────────────────────────────────────���─────

  describe('create', () => {
    it('creates a strand pinned to the current frontier', async () => {
      const descriptor = await service.create({ strandId: 'alpha' });

      expect(descriptor.schemaVersion).toBe(STRAND_SCHEMA_VERSION);
      expect(descriptor.strandId).toBe('alpha');
      expect(descriptor.graphName).toBe('test-graph');
      expect(descriptor.baseObservation.coordinateVersion).toBe(STRAND_COORDINATE_VERSION);
      expect(descriptor.baseObservation.frontier).toEqual({ writer1: 'tip-sha-1' });
      expect(descriptor.overlay.overlayId).toBe('alpha');
      expect(descriptor.overlay.kind).toBe(STRAND_OVERLAY_KIND);
      expect(descriptor.overlay.headPatchSha).toBeNull();
      expect(descriptor.overlay.patchCount).toBe(0);
      expect(descriptor.overlay.writable).toBe(true);
      expect(descriptor.materialization.cacheAuthority).toBe('derived');
    });

    it('persists the descriptor as a blob and updates the ref', async () => {
      await service.create({ strandId: 'alpha' });

      expect(graph._persistence.writeBlob).toHaveBeenCalledTimes(1);
      expect(graph._persistence.updateRef).toHaveBeenCalledTimes(1);
      const refPath = graph._persistence.updateRef.mock.calls[0][0];
      expect(refPath).toContain('strands/alpha');
    });

    it('generates a strandId when none is provided', async () => {
      const descriptor = await service.create();

      expect(descriptor.strandId).toBeTruthy();
      expect(typeof descriptor.strandId).toBe('string');
    });

    it('throws E_STRAND_ALREADY_EXISTS when strand exists', async () => {
      const desc = buildValidDescriptor({ strandId: 'existing' });
      storeDescriptor(desc);

      await expect(service.create({ strandId: 'existing' }))
        .rejects.toThrow(StrandError);

      try {
        await service.create({ strandId: 'existing' });
      } catch (err) {
        expect(err.code).toBe('E_STRAND_ALREADY_EXISTS');
      }
    });

    it('computes frontier digest via crypto', async () => {
      await service.create({ strandId: 'alpha' });

      expect(graph._crypto.hash).toHaveBeenCalledWith('sha256', expect.any(String));
    });

    it('uses clock for timestamps', async () => {
      const descriptor = await service.create({ strandId: 'alpha' });

      expect(graph._clock.timestamp).toHaveBeenCalled();
      expect(descriptor.createdAt).toBeTruthy();
      expect(descriptor.updatedAt).toBe(descriptor.createdAt);
    });

    it('forwards owner and scope options', async () => {
      const descriptor = await service.create({
        strandId: 'alpha',
        owner: 'alice',
        scope: 'team-a',
      });

      expect(descriptor.owner).toBe('alice');
      expect(descriptor.scope).toBe('team-a');
    });

    it('forwards lease expiresAt option', async () => {
      const descriptor = await service.create({
        strandId: 'alpha',
        leaseExpiresAt: '2026-12-31T23:59:59.000Z',
      });

      expect(descriptor.lease.expiresAt).toBe('2026-12-31T23:59:59.000Z');
    });

    it('forwards lamportCeiling option', async () => {
      const descriptor = await service.create({
        strandId: 'alpha',
        lamportCeiling: 42,
      });

      expect(descriptor.baseObservation.lamportCeiling).toBe(42);
    });

    it('throws E_STRAND_ID_INVALID for malformed strandId', async () => {
      await expect(service.create({ strandId: '' }))
        .rejects.toThrow(StrandError);
    });

    it('throws E_STRAND_INVALID_ARGS for non-string owner', async () => {
      await expect(
        service.create({ strandId: 'alpha', owner: /** @type {any} */ (17) }),
      ).rejects.toMatchObject({ code: 'E_STRAND_INVALID_ARGS' });
    });

    it('throws E_STRAND_COORDINATE_INVALID for invalid lamportCeiling', async () => {
      await expect(
        service.create({ strandId: 'alpha', lamportCeiling: -1 }),
      ).rejects.toMatchObject({ code: 'E_STRAND_COORDINATE_INVALID' });
    });

    it('throws E_STRAND_INVALID_ARGS for non-string leaseExpiresAt', async () => {
      await expect(
        service.create({ strandId: 'alpha', leaseExpiresAt: /** @type {any} */ (123) }),
      ).rejects.toMatchObject({ code: 'E_STRAND_INVALID_ARGS' });
    });

    it('throws E_STRAND_INVALID_ARGS for malformed leaseExpiresAt timestamps', async () => {
      await expect(
        service.create({ strandId: 'alpha', leaseExpiresAt: 'definitely-not-iso' }),
      ).rejects.toMatchObject({ code: 'E_STRAND_INVALID_ARGS' });
    });
  });

  // ── get ───────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns descriptor when strand exists', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      const result = await service.get('alpha');

      expect(result).not.toBeNull();
      expect(result.strandId).toBe('alpha');
    });

    it('returns null when strand does not exist', async () => {
      const result = await service.get('missing');

      expect(result).toBeNull();
    });

    it('hydrates overlay metadata from live refs', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      const result = await service.get('alpha');

      expect(result.overlay).toBeDefined();
      expect(result.overlay.writable).toBe(true);
    });

    it('sorts braided read overlays from persisted descriptors', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        braid: {
          readOverlays: [
            {
              strandId: 'zeta',
              overlayId: 'zeta',
              kind: STRAND_OVERLAY_KIND,
              headPatchSha: 'zeta-head',
              patchCount: 1,
            },
            {
              strandId: 'beta',
              overlayId: 'beta',
              kind: STRAND_OVERLAY_KIND,
              headPatchSha: 'beta-head',
              patchCount: 2,
            },
          ],
        },
      });
      storeDescriptor(desc);

      const result = await service.get('alpha');

      expect(result.braid.readOverlays.map((overlay) => overlay.strandId)).toEqual(['beta', 'zeta']);
    });

    it('throws E_STRAND_ID_INVALID for invalid strandId', async () => {
      await expect(service.get('')).rejects.toThrow(StrandError);
    });

    it('throws E_STRAND_MISSING_OBJECT when blob is missing', async () => {
      // Set ref to point to a non-existent blob
      refs.set('refs/warp/test-graph/strands/ghost', 'nonexistent-oid');

      await expect(service.get('ghost')).rejects.toThrow(StrandError);
    });

    it('throws E_STRAND_CORRUPT when descriptor graphName differs', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha', graphName: 'other-graph' });
      const oid = nextOid();
      blobs.set(oid, textEncode(JSON.stringify(desc)));
      refs.set('refs/warp/test-graph/strands/alpha', oid);

      await expect(service.get('alpha')).rejects.toThrow(StrandError);
    });

    it('throws E_STRAND_CORRUPT for invalid JSON', async () => {
      const oid = nextOid();
      blobs.set(oid, textEncode('not valid json!!!'));
      refs.set('refs/warp/test-graph/strands/broken', oid);

      await expect(service.get('broken')).rejects.toThrow(StrandError);
    });
  });

  // ── getOrThrow ────────────────────────────────────────────────────────────

  describe('getOrThrow', () => {
    it('returns descriptor when strand exists', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      const result = await service.getOrThrow('alpha');
      expect(result.strandId).toBe('alpha');
    });

    it('throws E_STRAND_NOT_FOUND when strand is missing', async () => {
      try {
        await service.getOrThrow('missing');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StrandError);
        expect(err.code).toBe('E_STRAND_NOT_FOUND');
      }
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns all strands sorted by strandId', async () => {
      storeDescriptor(buildValidDescriptor({ strandId: 'charlie' }));
      storeDescriptor(buildValidDescriptor({ strandId: 'alpha' }));
      storeDescriptor(buildValidDescriptor({ strandId: 'bravo' }));

      const result = await service.list();

      expect(result).toHaveLength(3);
      expect(result[0].strandId).toBe('alpha');
      expect(result[1].strandId).toBe('bravo');
      expect(result[2].strandId).toBe('charlie');
    });

    it('returns empty array when no strands exist', async () => {
      const result = await service.list();
      expect(result).toEqual([]);
    });

    it('throws when a strand blob is corrupt', async () => {
      storeDescriptor(buildValidDescriptor({ strandId: 'good' }));
      // Create a ref pointing to broken blob
      const badOid = nextOid();
      blobs.set(badOid, textEncode('not json'));
      refs.set('refs/warp/test-graph/strands/bad', badOid);

      await expect(service.list()).rejects.toThrow(StrandError);
    });
  });

  // ── drop ──────────────────────────────────────────────────────────────────

  describe('drop', () => {
    it('deletes all refs for a strand and returns true', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);
      // Also add overlay and braid refs using correct ref layout
      refs.set('refs/warp/test-graph/strand-overlays/alpha', 'overlay-sha');
      refs.set('refs/warp/test-graph/strand-braids/alpha/beta', 'braid-sha');

      const result = await service.drop('alpha');

      expect(result).toBe(true);
      expect(refs.has('refs/warp/test-graph/strands/alpha/descriptor')).toBe(false);
    });

    it('returns false when strand does not exist', async () => {
      const result = await service.drop('missing');
      expect(result).toBe(false);
    });
  });

  // ── braid ─────────────────────────────────────────────────────────────────

  describe('braid', () => {
    it('attaches read-only overlay strands', async () => {
      // Create target strand
      const target = buildValidDescriptor({ strandId: 'target' });
      storeDescriptor(target);

      // Create a braided strand with matching base observation
      const braided = buildValidDescriptor({
        strandId: 'support',
        overlay: {
          overlayId: 'support',
          kind: STRAND_OVERLAY_KIND,
          headPatchSha: 'support-head',
          patchCount: 2,
          writable: true,
        },
      });
      storeDescriptor(braided);

      const result = await service.braid('target', {
        braidedStrandIds: ['support'],
      });

      expect(result.braid.readOverlays).toHaveLength(1);
      expect(result.braid.readOverlays[0].strandId).toBe('support');
    });

    it('throws E_STRAND_COORDINATE_INVALID for mismatched base observations', async () => {
      const target = buildValidDescriptor({ strandId: 'target' });
      storeDescriptor(target);

      const mismatched = buildValidDescriptor({
        strandId: 'divergent',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { writer2: 'different-tip' },
          frontierDigest: 'different-digest',
          lamportCeiling: null,
        },
      });
      storeDescriptor(mismatched);

      await expect(
        service.braid('target', { braidedStrandIds: ['divergent'] }),
      ).rejects.toThrow(StrandError);
    });

    it('throws when braided strands have different frontier cardinality', async () => {
      const target = buildValidDescriptor({ strandId: 'target' });
      storeDescriptor(target);

      const support = buildValidDescriptor({
        strandId: 'support',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { writer1: 'tip-sha-1', writer2: 'tip-sha-2' },
          frontierDigest: 'different-digest',
          lamportCeiling: null,
        },
      });
      storeDescriptor(support);

      await expect(
        service.braid('target', { braidedStrandIds: ['support'] }),
      ).rejects.toMatchObject({ code: 'E_STRAND_COORDINATE_INVALID' });
    });

    it('overrides writable flag when provided', async () => {
      const target = buildValidDescriptor({ strandId: 'target' });
      storeDescriptor(target);

      const result = await service.braid('target', { writable: false });

      expect(result.overlay.writable).toBe(false);
    });

    it('throws E_STRAND_NOT_FOUND for missing target', async () => {
      await expect(service.braid('missing')).rejects.toThrow(StrandError);
    });

    it('throws E_STRAND_INVALID_ARGS for self-braids', async () => {
      const target = buildValidDescriptor({ strandId: 'target' });
      storeDescriptor(target);

      try {
        await service.braid('target', { braidedStrandIds: ['target'] });
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StrandError);
        expect(err.code).toBe('E_STRAND_INVALID_ARGS');
      }
    });

    it('deduplicates braided strand IDs', async () => {
      const target = buildValidDescriptor({ strandId: 'target' });
      storeDescriptor(target);

      const support = buildValidDescriptor({ strandId: 'support' });
      storeDescriptor(support);

      const result = await service.braid('target', {
        braidedStrandIds: ['support', 'support', 'support'],
      });

      expect(result.braid.readOverlays).toHaveLength(1);
    });

    it('throws E_STRAND_INVALID_ARGS for non-array braidedStrandIds', async () => {
      const target = buildValidDescriptor({ strandId: 'target' });
      storeDescriptor(target);

      await expect(
        service.braid('target', { braidedStrandIds: /** @type {any} */ ('support') }),
      ).rejects.toMatchObject({ code: 'E_STRAND_INVALID_ARGS' });
    });

    it('throws E_STRAND_INVALID_ARGS for empty braided strand ids', async () => {
      const target = buildValidDescriptor({ strandId: 'target' });
      storeDescriptor(target);

      await expect(
        service.braid('target', { braidedStrandIds: ['   '] }),
      ).rejects.toMatchObject({ code: 'E_STRAND_INVALID_ARGS' });
    });

    it('throws E_STRAND_INVALID_ARGS for non-boolean writable overrides', async () => {
      const target = buildValidDescriptor({ strandId: 'target' });
      storeDescriptor(target);

      await expect(
        service.braid('target', { writable: /** @type {any} */ ('yes') }),
      ).rejects.toMatchObject({ code: 'E_STRAND_INVALID_ARGS' });
    });
  });

  // ── materialize ───────────────────────────────────────────────────────────

  describe('materialize', () => {
    /*
     * materialize() calls openDetachedReadGraph() which invokes
     * graph.constructor.open(). We mock the constructor to support this.
     */

    /** @type {ReturnType<typeof createMockGraph>} */
    let detachedGraph;
    let openSpy;

    beforeEach(() => {
      // Create a mock class constructor with static open()
      detachedGraph = createMockGraph();
      // Copy refs/blobs from main graph to detached
      detachedGraph._persistence.readRef = graph._persistence.readRef;
      detachedGraph._persistence.readBlob = graph._persistence.readBlob;
      detachedGraph._persistence.listRefs = graph._persistence.listRefs;
      detachedGraph._loadPatchChainFromSha = graph._loadPatchChainFromSha;

      function MockGraphClass() {}
      openSpy = vi.fn(async () => detachedGraph);
      MockGraphClass.open = openSpy;
      Object.setPrototypeOf(graph, MockGraphClass.prototype);
      Object.defineProperty(graph, 'constructor', { value: MockGraphClass });
    });

    it('returns materialized state for a strand with no patches', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      const result = await service.materialize('alpha');

      expect(result).toBeDefined();
      expect(result.nodeAlive).toBeDefined();
    });

    it('returns state + receipts when receipts option is true', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      const result = await service.materialize('alpha', { receipts: true });

      expect(result.state).toBeDefined();
      expect(result.receipts).toBeDefined();
      expect(Array.isArray(result.receipts)).toBe(true);
    });

    it('applies lamport ceiling filter', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { writer1: 'tip-sha-1' },
          frontierDigest: 'digest-abc',
          lamportCeiling: null,
        },
      });
      storeDescriptor(desc);

      // Set up patch chain with patches at different lamport values
      patchChains.set('tip-sha-1', [
        { patch: { lamport: 1, writer: 'writer1', schema: 2, ops: [] }, sha: 'p1' },
        { patch: { lamport: 5, writer: 'writer1', schema: 2, ops: [] }, sha: 'p2' },
        { patch: { lamport: 10, writer: 'writer1', schema: 2, ops: [] }, sha: 'p3' },
      ]);

      // Ceiling of 5 should exclude the lamport=10 patch
      const result = await service.materialize('alpha', { ceiling: 5 });
      expect(result).toBeDefined();
    });

    it('throws E_STRAND_NOT_FOUND for missing strand', async () => {
      await expect(service.materialize('missing')).rejects.toThrow(StrandError);
    });

    it('freezes the returned state', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      const result = await service.materialize('alpha');

      expect(Object.isFrozen(result)).toBe(true);
    });

    it('forwards detached graph runtime options from the host graph', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);
      const checkpointPolicy = { mode: 'aggressive' };
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const seekCache = { get: vi.fn(), set: vi.fn(), clear: vi.fn() };
      const patchBlobStorage = { store: vi.fn(), load: vi.fn() };
      graph._checkpointPolicy = checkpointPolicy;
      graph._logger = logger;
      graph._seekCache = seekCache;
      graph._patchBlobStorage = patchBlobStorage;

      await service.materialize('alpha');

      expect(openSpy).toHaveBeenCalledWith(expect.objectContaining({
        checkpointPolicy,
        logger,
        seekCache,
        patchBlobStorage,
      }));
    });
  });

  // ── createPatchBuilder ────────────────────────────────────────────────────

  describe('createPatchBuilder', () => {
    it('throws E_STRAND_NOT_FOUND for missing strand', async () => {
      await expect(service.createPatchBuilder('missing')).rejects.toThrow(StrandError);
    });

    it('throws E_STRAND_INVALID_ARGS when overlay is not writable', async () => {
      const desc = buildValidDescriptor({
        strandId: 'readonly',
        overlay: {
          overlayId: 'readonly',
          kind: STRAND_OVERLAY_KIND,
          headPatchSha: null,
          patchCount: 0,
          writable: false,
        },
      });
      storeDescriptor(desc);

      try {
        await service.createPatchBuilder('readonly');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StrandError);
        expect(err.code).toBe('E_STRAND_INVALID_ARGS');
      }
    });

    it('returns a PatchBuilderV2 for writable strands', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      const builder = await service.createPatchBuilder('alpha');

      expect(builder).toBeDefined();
      expect(typeof builder.addNode).toBe('function');
      expect(typeof builder.commit).toBe('function');
    });

    it('passes logger and cached state through to the patch builder', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const cachedState = createEmptyStateV5();
      graph._logger = logger;
      graph._cachedState = cachedState;

      const builder = await service.createPatchBuilder('alpha');

      expect(builder._logger).toBe(logger);
      expect(builder._getCurrentState()).toBe(cachedState);
    });
  });

  // ── patch ─────────────────────────────────────────────────────────────────

  describe('patch', () => {
    it('throws E_STRAND_REENTRANT when patch is already in progress', async () => {
      graph._patchInProgress = true;

      try {
        await service.patch('alpha', () => {});
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StrandError);
        expect(err.code).toBe('E_STRAND_REENTRANT');
      }
    });

    it('resets patchInProgress flag after error', async () => {
      // Strand doesn't exist, so createPatchBuilder will throw
      try {
        await service.patch('missing', () => {});
      } catch {
        // expected
      }

      expect(graph._patchInProgress).toBe(false);
    });

    it('sets and clears patchInProgress flag', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      let wasInProgress = false;
      try {
        await service.patch('alpha', (builder) => {
          wasInProgress = graph._patchInProgress;
          builder.addNode('node:test');
        });
      } catch {
        // commit may fail due to mock limitations — that's OK, we're testing the flag
      }

      expect(wasInProgress).toBe(true);
      expect(graph._patchInProgress).toBe(false);
    });
  });

  // ── queueIntent ───────────────────────────────────────────────────────────

  describe('queueIntent', () => {
    it('throws E_STRAND_REENTRANT when patch is already in progress', async () => {
      graph._patchInProgress = true;

      try {
        await service.queueIntent('alpha', () => {});
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StrandError);
        expect(err.code).toBe('E_STRAND_REENTRANT');
      }
    });

    it('resets patchInProgress flag after error', async () => {
      try {
        await service.queueIntent('missing', () => {});
      } catch {
        // expected — strand not found
      }

      expect(graph._patchInProgress).toBe(false);
    });

    it('throws E_STRAND_EMPTY_INTENT for empty operations', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      try {
        await service.queueIntent('alpha', () => {
          // No operations added
        });
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StrandError);
        expect(err.code).toBe('E_STRAND_EMPTY_INTENT');
      }
    });

    it('throws E_STRAND_INVALID_ARGS when overlay is not writable', async () => {
      const desc = buildValidDescriptor({
        strandId: 'readonly',
        overlay: {
          overlayId: 'readonly',
          kind: STRAND_OVERLAY_KIND,
          headPatchSha: null,
          patchCount: 0,
          writable: false,
        },
      });
      storeDescriptor(desc);

      try {
        await service.queueIntent('readonly', (builder) => {
          builder.addNode('node:test');
        });
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StrandError);
        expect(err.code).toBe('E_STRAND_INVALID_ARGS');
      }
    });

    it('returns a frozen queued intent with deterministic intentId', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      const intent = await service.queueIntent('alpha', (builder) => {
        builder.addNode('node:test');
      });

      expect(intent.intentId).toMatch(/^alpha\.intent\./);
      expect(intent.enqueuedAt).toBeTruthy();
      expect(intent.patch).toBeDefined();
      expect(Array.isArray(intent.reads)).toBe(true);
      expect(Array.isArray(intent.writes)).toBe(true);
      expect(Array.isArray(intent.contentBlobOids)).toBe(true);
      expect(Object.isFrozen(intent)).toBe(true);
    });

    it('persists updated descriptor with intent in queue', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      await service.queueIntent('alpha', (builder) => {
        builder.addNode('node:test');
      });

      // Should have written updated descriptor
      const updatedDesc = await service.get('alpha');
      expect(updatedDesc.intentQueue.intents).toHaveLength(1);
      expect(updatedDesc.intentQueue.nextIntentSeq).toBe(2);
    });

    it('clears cachedViewHash after queuing', async () => {
      graph._cachedViewHash = 'stale';
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      await service.queueIntent('alpha', (builder) => {
        builder.addNode('node:test');
      });

      expect(graph._cachedViewHash).toBeNull();
    });

    it('builds queued intents with snapshot state and logger wiring', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const snapshotState = createEmptyStateV5();
      graph._logger = logger;
      vi.spyOn(service, '_materializeDescriptor').mockResolvedValue({
        state: snapshotState,
        allPatches: [],
      });

      /** @type {unknown} */
      let seenState = null;
      /** @type {unknown} */
      let seenLogger = null;
      await service.queueIntent('alpha', (builder) => {
        seenState = builder._getCurrentState();
        seenLogger = builder._logger;
        builder.addNode('node:test');
      });

      expect(seenState).toBe(snapshotState);
      expect(seenLogger).toBe(logger);
    });
  });

  // ── listIntents ───────────────────────────────────────────────────────────

  describe('listIntents', () => {
    it('returns empty array when no intents queued', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      const intents = await service.listIntents('alpha');
      expect(intents).toEqual([]);
    });

    it('returns frozen intent snapshots', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        intentQueue: {
          nextIntentSeq: 2,
          intents: [{
            intentId: 'alpha.intent.0001',
            enqueuedAt: '2026-04-06T00:00:00.000Z',
            patch: { schema: 2, ops: [{ op: 'NodeAdd', nodeId: 'n1', dot: ['w1', 1] }] },
            reads: ['n1'],
            writes: ['n1'],
            contentBlobOids: [],
          }],
        },
      });
      storeDescriptor(desc);

      const intents = await service.listIntents('alpha');

      expect(intents).toHaveLength(1);
      expect(intents[0].intentId).toBe('alpha.intent.0001');
      expect(Object.isFrozen(intents[0])).toBe(true);
    });

    it('throws E_STRAND_NOT_FOUND for missing strand', async () => {
      await expect(service.listIntents('missing')).rejects.toThrow(StrandError);
    });
  });

  // ── tick ──────────────────────────────────────────────────────────────────

  describe('tick', () => {
    it('returns a frozen tick record for empty queue', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      const tickRecord = await service.tick('alpha');

      expect(tickRecord.tickId).toBeTruthy();
      expect(tickRecord.strandId).toBe('alpha');
      expect(tickRecord.tickIndex).toBe(1);
      expect(tickRecord.drainedIntentCount).toBe(0);
      expect(tickRecord.admittedIntentIds).toEqual([]);
      expect(tickRecord.rejected).toEqual([]);
      expect(Object.isFrozen(tickRecord)).toBe(true);
    });

    it('increments tickIndex from existing evolution', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        evolution: {
          tickCount: 3,
          lastTick: null,
        },
      });
      storeDescriptor(desc);

      const tickRecord = await service.tick('alpha');
      expect(tickRecord.tickIndex).toBe(4);
    });

    it('admits independent intents and rejects overlapping ones', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        intentQueue: {
          nextIntentSeq: 4,
          intents: [
            {
              intentId: 'alpha.intent.0001',
              enqueuedAt: '2026-04-06T00:00:01.000Z',
              patch: { schema: 2, ops: [{ op: 'NodeAdd', nodeId: 'n1', dot: ['w1', 1] }] },
              reads: ['n1'],
              writes: ['n1'],
              contentBlobOids: [],
            },
            {
              intentId: 'alpha.intent.0002',
              enqueuedAt: '2026-04-06T00:00:02.000Z',
              patch: { schema: 2, ops: [{ op: 'NodeAdd', nodeId: 'n1', dot: ['w1', 2] }] },
              reads: ['n1'],
              writes: ['n1'],
              contentBlobOids: [],
            },
            {
              intentId: 'alpha.intent.0003',
              enqueuedAt: '2026-04-06T00:00:03.000Z',
              patch: { schema: 2, ops: [{ op: 'NodeAdd', nodeId: 'n2', dot: ['w1', 3] }] },
              reads: ['n2'],
              writes: ['n2'],
              contentBlobOids: [],
            },
          ],
        },
      });
      storeDescriptor(desc);

      const tickRecord = await service.tick('alpha');

      // First intent (n1) admitted, second (n1 overlap) rejected, third (n2) admitted
      expect(tickRecord.admittedIntentIds).toContain('alpha.intent.0001');
      expect(tickRecord.admittedIntentIds).toContain('alpha.intent.0003');
      expect(tickRecord.admittedIntentIds).toHaveLength(2);
      expect(tickRecord.rejected).toHaveLength(1);
      expect(tickRecord.rejected[0].intentId).toBe('alpha.intent.0002');
      expect(tickRecord.rejected[0].reason).toBe(STRAND_COUNTERFACTUAL_REASON);
      expect(tickRecord.rejected[0].conflictsWith).toContain('alpha.intent.0001');
    });

    it('clears the intent queue after tick', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        intentQueue: {
          nextIntentSeq: 2,
          intents: [{
            intentId: 'alpha.intent.0001',
            enqueuedAt: '2026-04-06T00:00:01.000Z',
            patch: { schema: 2, ops: [{ op: 'NodeAdd', nodeId: 'n1', dot: ['w1', 1] }] },
            reads: ['n1'],
            writes: ['n1'],
            contentBlobOids: [],
          }],
        },
      });
      storeDescriptor(desc);

      await service.tick('alpha');

      const updatedDesc = await service.get('alpha');
      expect(updatedDesc.intentQueue.intents).toHaveLength(0);
    });

    it('updates graph cache flags after tick', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      graph._stateDirty = false;
      graph._cachedViewHash = 'stale';
      graph._cachedCeiling = 42;
      graph._cachedFrontier = new Map();

      await service.tick('alpha');

      expect(graph._stateDirty).toBe(true);
      expect(graph._cachedViewHash).toBeNull();
      expect(graph._cachedCeiling).toBeNull();
      expect(graph._cachedFrontier).toBeNull();
    });

    it('throws E_STRAND_NOT_FOUND for missing strand', async () => {
      await expect(service.tick('missing')).rejects.toThrow(StrandError);
    });
  });

  // ── getPatchEntries ───────────────────────────────────────────────────────

  describe('getPatchEntries', () => {
    it('returns patches from base observation writers', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { writer1: 'tip-sha-1' },
          frontierDigest: 'digest-abc',
          lamportCeiling: null,
        },
      });
      storeDescriptor(desc);

      patchChains.set('tip-sha-1', [
        { patch: { lamport: 1, writer: 'writer1', schema: 2, ops: [] }, sha: 'patch-1' },
        { patch: { lamport: 2, writer: 'writer1', schema: 2, ops: [] }, sha: 'patch-2' },
      ]);

      const entries = await service.getPatchEntries('alpha');
      expect(entries).toHaveLength(2);
    });

    it('filters by ceiling when provided', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { writer1: 'tip-sha-1' },
          frontierDigest: 'digest-abc',
          lamportCeiling: null,
        },
      });
      storeDescriptor(desc);

      patchChains.set('tip-sha-1', [
        { patch: { lamport: 1, writer: 'writer1', schema: 2, ops: [] }, sha: 'patch-1' },
        { patch: { lamport: 5, writer: 'writer1', schema: 2, ops: [] }, sha: 'patch-2' },
        { patch: { lamport: 10, writer: 'writer1', schema: 2, ops: [] }, sha: 'patch-3' },
      ]);

      const entries = await service.getPatchEntries('alpha', { ceiling: 5 });
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.patch.lamport <= 5)).toBe(true);
    });

    it('deduplicates patches by SHA', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { writer1: 'tip-sha-1', writer2: 'tip-sha-2' },
          frontierDigest: 'digest-abc',
          lamportCeiling: null,
        },
      });
      storeDescriptor(desc);

      const sharedPatch = { patch: { lamport: 1, writer: 'writer1', schema: 2, ops: [] }, sha: 'shared-sha' };
      patchChains.set('tip-sha-1', [sharedPatch]);
      patchChains.set('tip-sha-2', [sharedPatch]);

      const entries = await service.getPatchEntries('alpha');
      expect(entries).toHaveLength(1);
    });

    it('includes overlay patches', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        overlay: {
          overlayId: 'alpha',
          kind: STRAND_OVERLAY_KIND,
          headPatchSha: 'overlay-head',
          patchCount: 1,
          writable: true,
        },
      });
      storeDescriptor(desc);
      // Also set overlay ref so hydration sees it
      refs.set('refs/warp/test-graph/strand-overlays/alpha', 'overlay-head');

      patchChains.set('tip-sha-1', [
        { patch: { lamport: 1, writer: 'writer1', schema: 2, ops: [] }, sha: 'base-1' },
      ]);
      patchChains.set('overlay-head', [
        { patch: { lamport: 2, writer: 'alpha', schema: 2, ops: [] }, sha: 'overlay-1' },
      ]);

      const entries = await service.getPatchEntries('alpha');
      expect(entries).toHaveLength(2);
    });

    it('includes braided overlay patches', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        braid: {
          readOverlays: [{
            strandId: 'support',
            overlayId: 'overlay-support',
            kind: STRAND_OVERLAY_KIND,
            headPatchSha: 'support-head',
            patchCount: 1,
          }],
        },
      });
      storeDescriptor(desc);

      patchChains.set('tip-sha-1', [
        { patch: { lamport: 1, writer: 'writer1', schema: 2, ops: [] }, sha: 'base-1' },
      ]);
      patchChains.set('support-head', [
        { patch: { lamport: 3, writer: 'overlay-support', schema: 2, ops: [] }, sha: 'support-1' },
      ]);

      const entries = await service.getPatchEntries('alpha');
      expect(entries).toHaveLength(2);
    });

    it('throws E_STRAND_NOT_FOUND for missing strand', async () => {
      await expect(service.getPatchEntries('missing')).rejects.toThrow(StrandError);
    });
  });

  // ── patchesFor ────────────────────────────────────────────────────────────

  describe('patchesFor', () => {
    it('returns sorted SHAs of patches touching the entity', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      patchChains.set('tip-sha-1', [
        {
          patch: {
            lamport: 1,
            writer: 'writer1',
            schema: 2,
            ops: [{ op: 'NodeAdd', nodeId: 'user:alice', dot: ['writer1', 1] }],
            reads: ['user:alice'],
            writes: ['user:alice'],
          },
          sha: 'sha-bbb',
        },
        {
          patch: {
            lamport: 2,
            writer: 'writer1',
            schema: 2,
            ops: [{ op: 'NodeAdd', nodeId: 'user:bob', dot: ['writer1', 2] }],
            reads: ['user:bob'],
            writes: ['user:bob'],
          },
          sha: 'sha-aaa',
        },
      ]);

      const shas = await service.patchesFor('alpha', 'user:alice');
      expect(shas).toEqual(['sha-bbb']);
    });

    it('returns empty array when no patches touch the entity', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      patchChains.set('tip-sha-1', [
        {
          patch: {
            lamport: 1,
            writer: 'writer1',
            schema: 2,
            ops: [],
            reads: [],
            writes: [],
          },
          sha: 'sha-1',
        },
      ]);

      const shas = await service.patchesFor('alpha', 'user:alice');
      expect(shas).toEqual([]);
    });

    it('throws E_STRAND_INVALID_ARGS for empty entityId', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      try {
        await service.patchesFor('alpha', '');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StrandError);
        expect(err.code).toBe('E_STRAND_INVALID_ARGS');
      }
    });

    it('throws E_STRAND_INVALID_ARGS for null entityId', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      await expect(
        service.patchesFor('alpha', /** @type {any} */ (null)),
      ).rejects.toMatchObject({ code: 'E_STRAND_INVALID_ARGS' });
    });

    it('returns results sorted lexicographically', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      storeDescriptor(desc);

      patchChains.set('tip-sha-1', [
        {
          patch: { lamport: 1, writer: 'w1', schema: 2, ops: [{ op: 'NodeAdd', nodeId: 'user:alice', dot: ['w1', 1] }], reads: ['user:alice'], writes: ['user:alice'] },
          sha: 'zzz',
        },
        {
          patch: { lamport: 2, writer: 'w1', schema: 2, ops: [{ op: 'NodeAdd', nodeId: 'user:alice', dot: ['w1', 2] }], reads: ['user:alice'], writes: ['user:alice'] },
          sha: 'aaa',
        },
      ]);

      const shas = await service.patchesFor('alpha', 'user:alice');
      expect(shas).toEqual(['aaa', 'zzz']);
    });
  });

  // ── _classifyQueuedIntents (footprint overlap algorithm) ──────────────────

  describe('_classifyQueuedIntents', () => {
    it('admits all intents when footprints are disjoint', () => {
      const intents = [
        { intentId: 'i1', reads: ['a'], writes: ['a'], patch: {}, enqueuedAt: '', contentBlobOids: [] },
        { intentId: 'i2', reads: ['b'], writes: ['b'], patch: {}, enqueuedAt: '', contentBlobOids: [] },
        { intentId: 'i3', reads: ['c'], writes: ['c'], patch: {}, enqueuedAt: '', contentBlobOids: [] },
      ];

      const { admitted, rejected } = service._classifyQueuedIntents(intents);

      expect(admitted).toHaveLength(3);
      expect(rejected).toHaveLength(0);
    });

    it('rejects intents with overlapping writes', () => {
      const intents = [
        { intentId: 'i1', reads: [], writes: ['shared'], patch: {}, enqueuedAt: '', contentBlobOids: [] },
        { intentId: 'i2', reads: [], writes: ['shared'], patch: {}, enqueuedAt: '', contentBlobOids: [] },
      ];

      const { admitted, rejected } = service._classifyQueuedIntents(intents);

      expect(admitted).toHaveLength(1);
      expect(admitted[0].intentId).toBe('i1');
      expect(rejected).toHaveLength(1);
      expect(rejected[0].intentId).toBe('i2');
      expect(rejected[0].reason).toBe(STRAND_COUNTERFACTUAL_REASON);
      expect(rejected[0].conflictsWith).toEqual(['i1']);
    });

    it('rejects intents with overlapping reads and writes', () => {
      const intents = [
        { intentId: 'i1', reads: ['x'], writes: ['y'], patch: {}, enqueuedAt: '', contentBlobOids: [] },
        { intentId: 'i2', reads: ['y'], writes: ['z'], patch: {}, enqueuedAt: '', contentBlobOids: [] },
      ];

      const { admitted, rejected } = service._classifyQueuedIntents(intents);

      // i1 footprint = {x, y}, i2 footprint = {y, z} — overlap on 'y'
      expect(admitted).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].conflictsWith).toEqual(['i1']);
    });

    it('reports multiple conflicting intents in conflictsWith', () => {
      const intents = [
        { intentId: 'i1', reads: ['a'], writes: ['shared'], patch: {}, enqueuedAt: '', contentBlobOids: [] },
        { intentId: 'i2', reads: ['b'], writes: [], patch: {}, enqueuedAt: '', contentBlobOids: [] },
        { intentId: 'i3', reads: ['shared', 'b'], writes: [], patch: {}, enqueuedAt: '', contentBlobOids: [] },
      ];

      const { admitted, rejected } = service._classifyQueuedIntents(intents);

      // i1 admitted (footprint: a, shared)
      // i2 admitted (footprint: b — disjoint)
      // i3 rejected (footprint: shared, b — overlaps with both i1 and i2)
      expect(admitted).toHaveLength(2);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].intentId).toBe('i3');
      expect(rejected[0].conflictsWith).toContain('i1');
      expect(rejected[0].conflictsWith).toContain('i2');
    });

    it('handles empty intent queue', () => {
      const { admitted, rejected } = service._classifyQueuedIntents([]);

      expect(admitted).toEqual([]);
      expect(rejected).toEqual([]);
    });

    it('preserves reads and writes in rejected counterfactuals', () => {
      const intents = [
        { intentId: 'i1', reads: ['a'], writes: ['b'], patch: {}, enqueuedAt: '', contentBlobOids: [] },
        { intentId: 'i2', reads: ['b'], writes: ['c'], patch: {}, enqueuedAt: '', contentBlobOids: [] },
      ];

      const { rejected } = service._classifyQueuedIntents(intents);

      expect(rejected[0].reads).toEqual(['b']);
      expect(rejected[0].writes).toEqual(['c']);
    });
  });

  // ── _buildRef / _buildOverlayRef / _buildBraidPrefix / _buildBraidRef ────

  describe('ref building', () => {
    it('_buildRef returns correct ref path', () => {
      const ref = service._buildRef('alpha');
      expect(ref).toContain('test-graph');
      expect(ref).toContain('alpha');
    });

    it('_buildOverlayRef returns correct ref path', () => {
      const ref = service._buildOverlayRef('alpha');
      expect(ref).toContain('test-graph');
      expect(ref).toContain('alpha');
      expect(ref).toContain('overlay');
    });

    it('_buildBraidPrefix returns correct prefix', () => {
      const prefix = service._buildBraidPrefix('alpha');
      expect(prefix).toContain('test-graph');
      expect(prefix).toContain('alpha');
      expect(prefix).toContain('braids');
    });

    it('_buildBraidRef returns correct ref path', () => {
      const ref = service._buildBraidRef('alpha', 'beta');
      expect(ref).toContain('test-graph');
      expect(ref).toContain('alpha');
      expect(ref).toContain('beta');
    });

    it('_buildRef throws E_STRAND_ID_INVALID for empty strandId', () => {
      expect(() => service._buildRef('')).toThrow(StrandError);
    });

    it('_buildOverlayRef throws E_STRAND_ID_INVALID for empty strandId', () => {
      expect(() => service._buildOverlayRef('')).toThrow(StrandError);
    });

    it('_buildBraidPrefix throws E_STRAND_ID_INVALID for empty strandId', () => {
      expect(() => service._buildBraidPrefix('')).toThrow(StrandError);
    });

    it('_buildBraidRef throws E_STRAND_ID_INVALID for empty strandId', () => {
      expect(() => service._buildBraidRef('', 'beta')).toThrow(StrandError);
    });

    it('_buildBraidRef throws E_STRAND_ID_INVALID for empty braidedStrandId', () => {
      expect(() => service._buildBraidRef('alpha', '')).toThrow(StrandError);
    });
  });

  // ── _readDescriptorByOid ──────────────────────────────────────────────────

  describe('_readDescriptorByOid', () => {
    it('parses valid descriptor blob', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      const oid = nextOid();
      blobs.set(oid, textEncode(JSON.stringify(desc)));

      const result = await service._readDescriptorByOid(oid, 'alpha');
      expect(result.strandId).toBe('alpha');
    });

    it('throws E_STRAND_MISSING_OBJECT for missing blob', async () => {
      try {
        await service._readDescriptorByOid('nonexistent', 'ghost');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StrandError);
        expect(err.code).toBe('E_STRAND_MISSING_OBJECT');
      }
    });

    it('throws E_STRAND_CORRUPT for invalid JSON', async () => {
      const oid = nextOid();
      blobs.set(oid, textEncode('not json'));

      try {
        await service._readDescriptorByOid(oid, 'broken');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StrandError);
        expect(err.code).toBe('E_STRAND_CORRUPT');
      }
    });

    it('throws E_STRAND_CORRUPT when graphName does not match', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha', graphName: 'other-graph' });
      const oid = nextOid();
      blobs.set(oid, textEncode(JSON.stringify(desc)));

      try {
        await service._readDescriptorByOid(oid, 'alpha');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StrandError);
        // Wraps the graph mismatch as corrupt since the inner error is re-thrown
        expect(err.code).toBe('E_STRAND_CORRUPT');
      }
    });
  });

  // ── _writeDescriptor ──────────────────────────────────────────────────────

  describe('_writeDescriptor', () => {
    it('serializes descriptor as JSON blob and updates ref', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });

      await service._writeDescriptor(desc);

      expect(graph._persistence.writeBlob).toHaveBeenCalledTimes(1);
      expect(graph._persistence.updateRef).toHaveBeenCalledTimes(1);

      // Verify the written blob is valid JSON
      const writtenData = graph._persistence.writeBlob.mock.calls[0][0];
      const parsed = JSON.parse(textDecode(writtenData));
      expect(parsed.strandId).toBe('alpha');
    });
  });

  // ── descriptor boundary helpers ──────────────────────────────────────────

  describe('_readOverlayMetadata', () => {
    it('returns null head and zero patches when no overlay ref exists', async () => {
      const metadata = await service._readOverlayMetadata('alpha');

      expect(metadata).toEqual({ headPatchSha: null, patchCount: 0 });
    });

    it('returns live overlay head and patch count from the overlay chain', async () => {
      refs.set('refs/warp/test-graph/strand-overlays/alpha', 'overlay-head');
      patchChains.set('overlay-head', [
        { patch: { lamport: 2, writer: 'alpha', schema: 2, ops: [] }, sha: 'overlay-1' },
        { patch: { lamport: 3, writer: 'alpha', schema: 2, ops: [] }, sha: 'overlay-2' },
      ]);

      const metadata = await service._readOverlayMetadata('alpha');

      expect(metadata).toEqual({ headPatchSha: 'overlay-head', patchCount: 2 });
    });
  });

  describe('_hydrateOverlayMetadata', () => {
    it('normalizes braid overlays and preserves matching live overlay metadata', async () => {
      const descriptor = buildValidDescriptor({
        strandId: 'alpha',
        overlay: {
          overlayId: 'alpha',
          kind: STRAND_OVERLAY_KIND,
          headPatchSha: 'overlay-head',
          patchCount: 2,
          writable: true,
        },
        braid: {
          readOverlays: [
            {
              strandId: 'zeta',
              overlayId: 'zeta',
              kind: STRAND_OVERLAY_KIND,
              headPatchSha: null,
              patchCount: 0,
            },
            {
              strandId: 'beta',
              overlayId: 'beta',
              kind: STRAND_OVERLAY_KIND,
              headPatchSha: null,
              patchCount: 0,
            },
          ],
        },
      });
      refs.set('refs/warp/test-graph/strand-overlays/alpha', 'overlay-head');
      patchChains.set('overlay-head', [
        { patch: { lamport: 2, writer: 'alpha', schema: 2, ops: [] }, sha: 'overlay-1' },
        { patch: { lamport: 3, writer: 'alpha', schema: 2, ops: [] }, sha: 'overlay-2' },
      ]);

      const hydrated = await service._hydrateOverlayMetadata(descriptor);

      expect(hydrated.overlay.headPatchSha).toBe('overlay-head');
      expect(hydrated.overlay.patchCount).toBe(2);
      expect(hydrated.braid.readOverlays.map((overlay) => overlay.strandId)).toEqual(['beta', 'zeta']);
    });

    it('replaces stale persisted overlay metadata with live overlay state', async () => {
      const descriptor = buildValidDescriptor({
        strandId: 'alpha',
        overlay: {
          overlayId: 'alpha',
          kind: STRAND_OVERLAY_KIND,
          headPatchSha: null,
          patchCount: 0,
          writable: true,
        },
      });
      refs.set('refs/warp/test-graph/strand-overlays/alpha', 'live-head');
      patchChains.set('live-head', [
        { patch: { lamport: 4, writer: 'alpha', schema: 2, ops: [] }, sha: 'overlay-1' },
      ]);

      const hydrated = await service._hydrateOverlayMetadata(descriptor);

      expect(hydrated.overlay.headPatchSha).toBe('live-head');
      expect(hydrated.overlay.patchCount).toBe(1);
    });
  });

  describe('_loadBraidedReadOverlays', () => {
    it('returns live overlay metadata for matching braided strands', async () => {
      const target = buildValidDescriptor({ strandId: 'target' });
      const support = buildValidDescriptor({
        strandId: 'support',
        overlay: {
          overlayId: 'support',
          kind: STRAND_OVERLAY_KIND,
          headPatchSha: null,
          patchCount: 0,
          writable: true,
        },
      });
      storeDescriptor(support);
      refs.set('refs/warp/test-graph/strand-overlays/support', 'support-head');
      patchChains.set('support-head', [
        { patch: { lamport: 5, writer: 'support', schema: 2, ops: [] }, sha: 'support-1' },
        { patch: { lamport: 6, writer: 'support', schema: 2, ops: [] }, sha: 'support-2' },
      ]);

      const readOverlays = await service._loadBraidedReadOverlays(target, ['support']);

      expect(readOverlays).toEqual([
        {
          strandId: 'support',
          overlayId: 'support',
          kind: STRAND_OVERLAY_KIND,
          headPatchSha: 'support-head',
          patchCount: 2,
        },
      ]);
    });
  });

  // ── _collectBasePatches ───────────────────────────────────────────────────

  describe('_collectBasePatches', () => {
    it('collects patches from all frontier writers', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { w1: 'tip1', w2: 'tip2' },
          frontierDigest: 'digest',
          lamportCeiling: null,
        },
      });

      patchChains.set('tip1', [
        { patch: { lamport: 1, writer: 'w1', schema: 2, ops: [] }, sha: 'p1' },
      ]);
      patchChains.set('tip2', [
        { patch: { lamport: 2, writer: 'w2', schema: 2, ops: [] }, sha: 'p2' },
      ]);

      const patches = await service._collectBasePatches(desc);
      expect(patches).toHaveLength(2);
    });

    it('respects lamportCeiling from base observation', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { w1: 'tip1' },
          frontierDigest: 'digest',
          lamportCeiling: 5,
        },
      });

      patchChains.set('tip1', [
        { patch: { lamport: 3, writer: 'w1', schema: 2, ops: [] }, sha: 'p1' },
        { patch: { lamport: 7, writer: 'w1', schema: 2, ops: [] }, sha: 'p2' },
      ]);

      const patches = await service._collectBasePatches(desc);
      expect(patches).toHaveLength(1);
      expect(patches[0].sha).toBe('p1');
    });

    it('skips writers with empty tip SHA', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { w1: '', w2: 'tip2' },
          frontierDigest: 'digest',
          lamportCeiling: null,
        },
      });

      patchChains.set('tip2', [
        { patch: { lamport: 1, writer: 'w2', schema: 2, ops: [] }, sha: 'p1' },
      ]);

      const patches = await service._collectBasePatches(desc);
      expect(patches).toHaveLength(1);
    });

    it('iterates frontier writers in sorted order', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { z_writer: 'tipZ', a_writer: 'tipA' },
          frontierDigest: 'digest',
          lamportCeiling: null,
        },
      });

      const callOrder = [];
      graph._loadPatchChainFromSha.mockImplementation(async (sha) => {
        callOrder.push(sha);
        return [];
      });

      await service._collectBasePatches(desc);
      expect(callOrder).toEqual(['tipA', 'tipZ']);
    });
  });

  describe('_collectPatchEntries', () => {
    it('deduplicates duplicate SHAs by first-seen source order', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { writer1: 'base-tip' },
          frontierDigest: 'digest',
          lamportCeiling: null,
        },
        overlay: {
          overlayId: 'alpha',
          kind: STRAND_OVERLAY_KIND,
          headPatchSha: 'overlay-head',
          patchCount: 1,
          writable: true,
        },
        braid: {
          readOverlays: [{
            strandId: 'support',
            overlayId: 'support',
            kind: STRAND_OVERLAY_KIND,
            headPatchSha: 'support-head',
            patchCount: 1,
          }],
        },
      });

      patchChains.set('base-tip', [
        { patch: { lamport: 1, writer: 'writer1', schema: 2, ops: [] }, sha: 'shared-sha' },
      ]);
      patchChains.set('support-head', [
        { patch: { lamport: 9, writer: 'support', schema: 2, ops: [] }, sha: 'shared-sha' },
      ]);
      patchChains.set('overlay-head', [
        { patch: { lamport: 10, writer: 'alpha', schema: 2, ops: [] }, sha: 'overlay-sha' },
      ]);

      const entries = await service._collectPatchEntries(desc, { ceiling: null });

      expect(entries).toHaveLength(2);
      expect(entries.find((entry) => entry.sha === 'shared-sha')?.patch.lamport).toBe(1);
      expect(entries.map((entry) => entry.sha)).toEqual(['shared-sha', 'overlay-sha']);
    });

    it('applies explicit ceiling after merging base, braid, and overlay patches', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { writer1: 'base-tip' },
          frontierDigest: 'digest',
          lamportCeiling: null,
        },
        overlay: {
          overlayId: 'alpha',
          kind: STRAND_OVERLAY_KIND,
          headPatchSha: 'overlay-head',
          patchCount: 1,
          writable: true,
        },
        braid: {
          readOverlays: [{
            strandId: 'support',
            overlayId: 'support',
            kind: STRAND_OVERLAY_KIND,
            headPatchSha: 'support-head',
            patchCount: 1,
          }],
        },
      });

      patchChains.set('base-tip', [
        { patch: { lamport: 1, writer: 'writer1', schema: 2, ops: [] }, sha: 'base-1' },
      ]);
      patchChains.set('support-head', [
        { patch: { lamport: 4, writer: 'support', schema: 2, ops: [] }, sha: 'support-1' },
      ]);
      patchChains.set('overlay-head', [
        { patch: { lamport: 8, writer: 'alpha', schema: 2, ops: [] }, sha: 'overlay-1' },
      ]);

      const entries = await service._collectPatchEntries(desc, { ceiling: 4 });

      expect(entries.map((entry) => entry.sha)).toEqual(['base-1', 'support-1']);
      expect(entries.every((entry) => entry.patch.lamport <= 4)).toBe(true);
    });
  });

  // ── _collectOverlayPatches ────────────────────────────────────────────────

  describe('_collectOverlayPatches', () => {
    it('returns empty for null headPatchSha', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      const patches = await service._collectOverlayPatches(desc);
      expect(patches).toEqual([]);
    });

    it('loads patches from overlay head', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        overlay: {
          overlayId: 'alpha',
          kind: STRAND_OVERLAY_KIND,
          headPatchSha: 'overlay-head',
          patchCount: 1,
          writable: true,
        },
      });

      patchChains.set('overlay-head', [
        { patch: { lamport: 5, writer: 'alpha', schema: 2, ops: [] }, sha: 'op1' },
      ]);

      const patches = await service._collectOverlayPatches(desc);
      expect(patches).toHaveLength(1);
    });
  });

  // ── _collectBraidedOverlayPatches ─────────────────────────────────────────

  describe('_collectBraidedOverlayPatches', () => {
    it('returns empty for no braided overlays', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      const patches = await service._collectBraidedOverlayPatches(desc);
      expect(patches).toEqual([]);
    });

    it('collects patches from all braided overlay heads', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        braid: {
          readOverlays: [
            { strandId: 's1', overlayId: 'o1', kind: STRAND_OVERLAY_KIND, headPatchSha: 'braid-head-1', patchCount: 1 },
            { strandId: 's2', overlayId: 'o2', kind: STRAND_OVERLAY_KIND, headPatchSha: 'braid-head-2', patchCount: 1 },
          ],
        },
      });

      patchChains.set('braid-head-1', [
        { patch: { lamport: 3, writer: 'o1', schema: 2, ops: [] }, sha: 'bp1' },
      ]);
      patchChains.set('braid-head-2', [
        { patch: { lamport: 4, writer: 'o2', schema: 2, ops: [] }, sha: 'bp2' },
      ]);

      const patches = await service._collectBraidedOverlayPatches(desc);
      expect(patches).toHaveLength(2);
    });

    it('skips braided overlays with null headPatchSha', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        braid: {
          readOverlays: [
            { strandId: 's1', overlayId: 'o1', kind: STRAND_OVERLAY_KIND, headPatchSha: null, patchCount: 0 },
          ],
        },
      });

      const patches = await service._collectBraidedOverlayPatches(desc);
      expect(patches).toEqual([]);
    });
  });

  // ── _materializeDescriptor ────────────────────────────────────────────────

  describe('_materializeDescriptor', () => {
    it('returns empty state when no patches exist', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: {},
          frontierDigest: 'empty',
          lamportCeiling: null,
        },
      });

      const { state, receipts, allPatches } = await service._materializeDescriptor(desc, {
        collectReceipts: false,
        ceiling: null,
      });

      expect(state.nodeAlive).toBeDefined();
      expect(allPatches).toHaveLength(0);
      expect(receipts).toEqual([]);
    });

    it('reduces patches through JoinReducer', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { writer1: 'chain-head' },
          frontierDigest: 'digest',
          lamportCeiling: null,
        },
      });

      patchChains.set('chain-head', [
        {
          patch: {
            lamport: 1,
            writer: 'writer1',
            schema: 2,
            ops: [{ op: 'NodeAdd', nodeId: 'user:alice', dot: ['writer1', 1] }],
          },
          sha: 'p1',
        },
      ]);

      const { state, allPatches } = await service._materializeDescriptor(desc, {
        collectReceipts: false,
        ceiling: null,
      });

      expect(allPatches).toHaveLength(1);
      // Verify node was added to state
      expect(state.nodeAlive).toBeDefined();
    });

    it('collects receipts when requested', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { writer1: 'chain-head' },
          frontierDigest: 'digest',
          lamportCeiling: null,
        },
      });

      patchChains.set('chain-head', [
        {
          patch: {
            lamport: 1,
            writer: 'writer1',
            schema: 2,
            ops: [{ op: 'NodeAdd', nodeId: 'user:alice', dot: ['writer1', 1] }],
          },
          sha: 'p1',
        },
      ]);

      const { receipts } = await service._materializeDescriptor(desc, {
        collectReceipts: true,
        ceiling: null,
      });

      expect(receipts).toHaveLength(1);
    });

    it('updates graph maxObservedLamport', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        baseObservation: {
          coordinateVersion: STRAND_COORDINATE_VERSION,
          frontier: { writer1: 'chain-head' },
          frontierDigest: 'digest',
          lamportCeiling: null,
        },
      });

      patchChains.set('chain-head', [
        { patch: { lamport: 42, writer: 'w1', schema: 2, ops: [] }, sha: 'p1' },
      ]);

      graph._maxObservedLamport = 0;
      await service._materializeDescriptor(desc, { collectReceipts: false, ceiling: null });

      expect(graph._maxObservedLamport).toBe(42);
    });

    it('rebuilds provenance index', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });

      patchChains.set('tip-sha-1', [
        {
          patch: { lamport: 1, writer: 'w1', schema: 2, ops: [], reads: ['node:a'], writes: ['node:a'] },
          sha: 'p1',
        },
      ]);

      await service._materializeDescriptor(desc, { collectReceipts: false, ceiling: null });

      expect(graph._provenanceIndex).not.toBeNull();
      expect(graph._provenanceDegraded).toBe(false);
    });

    it('calls _setMaterializedState on graph', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });

      await service._materializeDescriptor(desc, { collectReceipts: false, ceiling: null });

      expect(graph._setMaterializedState).toHaveBeenCalledTimes(1);
    });

    it('clears cached ceiling and frontier', async () => {
      graph._cachedCeiling = 99;
      graph._cachedFrontier = new Map();

      const desc = buildValidDescriptor({ strandId: 'alpha' });
      await service._materializeDescriptor(desc, { collectReceipts: false, ceiling: null });

      expect(graph._cachedCeiling).toBeNull();
      expect(graph._cachedFrontier).toBeNull();
    });
  });

  // ── _syncOverlayDescriptor ────────────────────────────────────────────────

  describe('_syncOverlayDescriptor', () => {
    it('updates descriptor with new head SHA and incremented patch count', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        overlay: {
          overlayId: 'alpha',
          kind: STRAND_OVERLAY_KIND,
          headPatchSha: null,
          patchCount: 0,
          writable: true,
        },
      });

      await service._syncOverlayDescriptor(desc, {
        patch: { lamport: 5, writer: 'alpha', schema: 2, ops: [] },
        sha: 'new-head-sha',
      });

      expect(graph._persistence.writeBlob).toHaveBeenCalled();
      expect(graph._persistence.updateRef).toHaveBeenCalled();
    });

    it('updates maxObservedLamport when patch lamport exceeds current', async () => {
      graph._maxObservedLamport = 3;
      const desc = buildValidDescriptor({ strandId: 'alpha' });

      await service._syncOverlayDescriptor(desc, {
        patch: { lamport: 10, writer: 'alpha', schema: 2, ops: [] },
        sha: 'sha1',
      });

      expect(graph._maxObservedLamport).toBe(10);
    });

    it('does not lower maxObservedLamport', async () => {
      graph._maxObservedLamport = 20;
      const desc = buildValidDescriptor({ strandId: 'alpha' });

      await service._syncOverlayDescriptor(desc, {
        patch: { lamport: 5, writer: 'alpha', schema: 2, ops: [] },
        sha: 'sha1',
      });

      expect(graph._maxObservedLamport).toBe(20);
    });

    it('marks state as dirty and clears caches', async () => {
      graph._stateDirty = false;
      graph._cachedViewHash = 'old';
      graph._cachedCeiling = 42;
      graph._cachedFrontier = new Map();
      const desc = buildValidDescriptor({ strandId: 'alpha' });

      await service._syncOverlayDescriptor(desc, {
        patch: { lamport: 1, writer: 'alpha', schema: 2, ops: [] },
        sha: 'sha1',
      });

      expect(graph._stateDirty).toBe(true);
      expect(graph._cachedViewHash).toBeNull();
      expect(graph._cachedCeiling).toBeNull();
      expect(graph._cachedFrontier).toBeNull();
    });
  });

  // ── _commitQueuedPatch ────────────────────────────────────────────────────

  describe('_commitQueuedPatch', () => {
    it('commits a patch via patch journal when available', async () => {
      const mockJournal = {
        writePatch: vi.fn(async () => 'a'.repeat(40)),
      };
      graph._patchJournal = mockJournal;

      const result = await service._commitQueuedPatch({
        strandId: 'alpha',
        overlayId: 'alpha',
        parentSha: null,
        patch: { schema: 2, ops: [{ op: 'NodeAdd', nodeId: 'n1', dot: ['w1', 1] }] },
        contentBlobOids: [],
        lamport: 5,
      });

      expect(mockJournal.writePatch).toHaveBeenCalledWith(
        expect.objectContaining({ writer: 'alpha', lamport: 5 }),
      );
      expect(result.sha).toBeTruthy();
      expect(result.patch.writer).toBe('alpha');
      expect(result.patch.lamport).toBe(5);
    });

    it('falls back to codec + writeBlob when no journal', async () => {
      graph._patchJournal = null;

      const result = await service._commitQueuedPatch({
        strandId: 'alpha',
        overlayId: 'alpha',
        parentSha: null,
        patch: { schema: 2, ops: [] },
        contentBlobOids: [],
        lamport: 3,
      });

      expect(graph._codec.encode).toHaveBeenCalled();
      expect(graph._persistence.writeBlob).toHaveBeenCalled();
      expect(result.sha).toBeTruthy();
    });

    it('uses patchBlobStorage when available', async () => {
      graph._patchJournal = null;
      graph._patchBlobStorage = {
        store: vi.fn(async () => 'b'.repeat(40)),
      };

      await service._commitQueuedPatch({
        strandId: 'alpha',
        overlayId: 'alpha',
        parentSha: null,
        patch: { schema: 2, ops: [] },
        contentBlobOids: [],
        lamport: 1,
      });

      expect(graph._patchBlobStorage.store).toHaveBeenCalled();
    });

    it('creates tree with content blob entries', async () => {
      graph._patchJournal = null;

      await service._commitQueuedPatch({
        strandId: 'alpha',
        overlayId: 'alpha',
        parentSha: null,
        patch: { schema: 2, ops: [] },
        contentBlobOids: ['blob-1', 'blob-2'],
        lamport: 1,
      });

      const treeEntries = graph._persistence.writeTree.mock.calls[0][0];
      expect(treeEntries).toHaveLength(3); // patch.cbor + 2 content blobs
      expect(treeEntries.some((e) => e.includes('_content_blob-1'))).toBe(true);
      expect(treeEntries.some((e) => e.includes('_content_blob-2'))).toBe(true);
    });

    it('deduplicates content blob OIDs', async () => {
      graph._patchJournal = null;

      await service._commitQueuedPatch({
        strandId: 'alpha',
        overlayId: 'alpha',
        parentSha: null,
        patch: { schema: 2, ops: [] },
        contentBlobOids: ['blob-1', 'blob-1', 'blob-1'],
        lamport: 1,
      });

      const treeEntries = graph._persistence.writeTree.mock.calls[0][0];
      expect(treeEntries).toHaveLength(2); // patch.cbor + 1 unique content blob
    });

    it('sets parent commit when parentSha is provided', async () => {
      graph._patchJournal = null;

      await service._commitQueuedPatch({
        strandId: 'alpha',
        overlayId: 'alpha',
        parentSha: 'parent-sha-abc',
        patch: { schema: 2, ops: [] },
        contentBlobOids: [],
        lamport: 1,
      });

      const commitArgs = graph._persistence.commitNodeWithTree.mock.calls[0][0];
      expect(commitArgs.parents).toEqual(['parent-sha-abc']);
    });

    it('uses empty parents when parentSha is null', async () => {
      graph._patchJournal = null;

      await service._commitQueuedPatch({
        strandId: 'alpha',
        overlayId: 'alpha',
        parentSha: null,
        patch: { schema: 2, ops: [] },
        contentBlobOids: [],
        lamport: 1,
      });

      const commitArgs = graph._persistence.commitNodeWithTree.mock.calls[0][0];
      expect(commitArgs.parents).toEqual([]);
    });

    it('updates overlay ref after commit', async () => {
      graph._patchJournal = null;

      await service._commitQueuedPatch({
        strandId: 'alpha',
        overlayId: 'alpha',
        parentSha: null,
        patch: { schema: 2, ops: [] },
        contentBlobOids: [],
        lamport: 1,
      });

      expect(graph._persistence.updateRef).toHaveBeenCalled();
      const refCall = graph._persistence.updateRef.mock.calls[0];
      expect(refCall[0]).toContain('overlay');
    });
  });

  // ── _syncBraidRefs ────────────────────────────────────────────────────────

  describe('_syncBraidRefs', () => {
    it('creates refs for braided overlays with head SHAs', async () => {
      const readOverlays = [
        { strandId: 's1', overlayId: 'o1', kind: STRAND_OVERLAY_KIND, headPatchSha: 'head-1', patchCount: 1 },
      ];

      await service._syncBraidRefs('alpha', readOverlays);

      expect(graph._persistence.updateRef).toHaveBeenCalledWith(
        expect.stringContaining('braids'),
        'head-1',
      );
    });

    it('deletes refs for braided overlays with null head SHAs', async () => {
      // Pre-seed a braid ref
      const braidRef = service._buildBraidRef('alpha', 's1');
      refs.set(braidRef, 'old-sha');

      const readOverlays = [
        { strandId: 's1', overlayId: 'o1', kind: STRAND_OVERLAY_KIND, headPatchSha: null, patchCount: 0 },
      ];

      await service._syncBraidRefs('alpha', readOverlays);

      expect(graph._persistence.deleteRef).toHaveBeenCalledWith(braidRef);
    });

    it('deletes stale braid refs not in current overlays', async () => {
      // Pre-seed a stale braid ref
      const staleRef = service._buildBraidRef('alpha', 'removed');
      refs.set(staleRef, 'old-sha');

      await service._syncBraidRefs('alpha', []);

      expect(graph._persistence.deleteRef).toHaveBeenCalledWith(staleRef);
    });
  });

  // ── _commitAdmittedQueuedIntents ──────────────────────────────────────────

  describe('_commitAdmittedQueuedIntents', () => {
    it('returns baseline values when no intents are admitted', async () => {
      const desc = buildValidDescriptor({
        strandId: 'alpha',
        overlay: {
          overlayId: 'alpha',
          kind: STRAND_OVERLAY_KIND,
          headPatchSha: 'existing-head',
          patchCount: 3,
          writable: true,
        },
      });

      const result = await service._commitAdmittedQueuedIntents(desc, []);

      expect(result.overlayHeadPatchSha).toBe('existing-head');
      expect(result.overlayPatchCount).toBe(3);
      expect(result.overlayPatchShas).toEqual([]);
    });

    it('commits multiple intents sequentially with incrementing lamport', async () => {
      graph._patchJournal = null;

      const desc = buildValidDescriptor({
        strandId: 'alpha',
        overlay: {
          overlayId: 'alpha',
          kind: STRAND_OVERLAY_KIND,
          headPatchSha: null,
          patchCount: 0,
          writable: true,
        },
      });

      const admitted = [
        {
          intentId: 'i1',
          enqueuedAt: '',
          patch: { schema: 2, ops: [{ op: 'NodeAdd', nodeId: 'n1', dot: ['w1', 1] }] },
          reads: ['n1'],
          writes: ['n1'],
          contentBlobOids: [],
          footprint: new Set(['n1']),
        },
        {
          intentId: 'i2',
          enqueuedAt: '',
          patch: { schema: 2, ops: [{ op: 'NodeAdd', nodeId: 'n2', dot: ['w1', 2] }] },
          reads: ['n2'],
          writes: ['n2'],
          contentBlobOids: [],
          footprint: new Set(['n2']),
        },
      ];

      const result = await service._commitAdmittedQueuedIntents(desc, admitted);

      expect(result.overlayPatchShas).toHaveLength(2);
      expect(result.overlayPatchCount).toBe(2);
      expect(result.maxLamport).toBeGreaterThan(0);
    });
  });

  // ── _persistTickResult ────────────────────────────────────────────────────

  describe('_persistTickResult', () => {
    it('updates descriptor and clears graph caches', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      graph._stateDirty = false;
      graph._cachedViewHash = 'old';
      graph._cachedCeiling = 42;
      graph._cachedFrontier = new Map();

      const tickRecord = Object.freeze({
        tickId: 'alpha.intent.0001',
        strandId: 'alpha',
        tickIndex: 1,
        createdAt: '2026-04-06T00:00:01.000Z',
        drainedIntentCount: 0,
        admittedIntentIds: [],
        rejected: [],
        baseOverlayHeadPatchSha: null,
        overlayHeadPatchSha: null,
        overlayPatchShas: [],
      });

      await service._persistTickResult({
        descriptor: desc,
        intentQueue: { nextIntentSeq: 1, intents: [] },
        tickIndex: 1,
        now: '2026-04-06T00:00:01.000Z',
        committed: { overlayHeadPatchSha: null, overlayPatchCount: 0, overlayPatchShas: [], maxLamport: 0 },
        tickRecord,
      });

      expect(graph._stateDirty).toBe(true);
      expect(graph._cachedViewHash).toBeNull();
      expect(graph._cachedCeiling).toBeNull();
      expect(graph._cachedFrontier).toBeNull();
    });

    it('updates maxObservedLamport when committed lamport exceeds current', async () => {
      const desc = buildValidDescriptor({ strandId: 'alpha' });
      graph._maxObservedLamport = 5;

      await service._persistTickResult({
        descriptor: desc,
        intentQueue: { nextIntentSeq: 1, intents: [] },
        tickIndex: 1,
        now: '2026-04-06T00:00:01.000Z',
        committed: { overlayHeadPatchSha: null, overlayPatchCount: 0, overlayPatchShas: [], maxLamport: 15 },
        tickRecord: Object.freeze({
          tickId: 'alpha.intent.0001', strandId: 'alpha', tickIndex: 1,
          createdAt: '', drainedIntentCount: 0, admittedIntentIds: [],
          rejected: [], baseOverlayHeadPatchSha: null,
          overlayHeadPatchSha: null, overlayPatchShas: [],
        }),
      });

      expect(graph._maxObservedLamport).toBe(15);
    });
  });
});
