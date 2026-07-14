import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { intent, openWarp, reading } from '../../../index.ts';
import { captureCoordinate } from '../../../advanced.ts';
import DraftTimeline from '../../../src/domain/api/DraftTimeline.ts';
import JoinReceipt from '../../../src/domain/api/JoinReceipt.ts';
import JoinResult from '../../../src/domain/api/JoinResult.ts';
import { OPEN_WARP_IDENTITY_FAILURE } from '../../../src/domain/api/OpenWarpIdentityFailure.ts';
import ReadReceipt from '../../../src/domain/api/ReadReceipt.ts';
import ReadingResult from '../../../src/domain/api/ReadingResult.ts';
import Timeline from '../../../src/domain/api/Timeline.ts';
import { requireTimelineRuntime } from '../../../src/domain/api/TimelineRuntime.ts';
import Warp from '../../../src/domain/api/Warp.ts';
import { MAX_WRITER_ID_LENGTH } from '../../../src/domain/utils/RefLayout.ts';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import { resolveWarpStorage } from '../../../src/application/WarpStorageRegistry.ts';
import { MemoryStorage } from '../../../storage.ts';

const FORBIDDEN_ROOT_SUBSTRATE_EXPORTS = Object.freeze([
  'openWarpGraph',
  'openWarpWorldline',
  'WarpGraph',
  'WarpWorldline',
  'WarpWorldlineOpticBasis',
  'ProjectionHandle',
  'WorldlineOptic',
  'Observer',
  'Optic',
  'Patch',
  'PatchBuilder',
  'PatchCommitter',
  'GitWarpBraidHologram',
  'GitWarpBraidHologramFields',
  'GitWarpBraidHologramMember',
  'GitWarpBraidHologramMemberFields',
  'GitWarpSuffixTransformHologram',
  'GitWarpSuffixTransformHologramFields',
  'GitWarpTickHologram',
  'GitWarpTickHologramFields',
]);

function exportedNamesFor(path: string): ReadonlySet<string> {
  const sourceFile = sourceFileFor(path);
  const exportedNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    collectExportDeclarationNames(statement, exportedNames);
    collectExportedDeclarationName(statement, exportedNames);
  }

  return exportedNames;
}

function allDeclaredNamesFor(path: string): ReadonlySet<string> {
  const sourceFile = sourceFileFor(path);
  const declaredNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    collectDeclaredStatementName(statement, declaredNames);
  }

  return declaredNames;
}

function sourceFileFor(path: string): ts.SourceFile {
  const sourceText = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
  return ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function collectExportDeclarationNames(statement: ts.Statement, exportedNames: Set<string>): void {
  if (!ts.isExportDeclaration(statement)) {
    return;
  }
  const exportClause = statement.exportClause;
  if (exportClause === undefined || !ts.isNamedExports(exportClause)) {
    return;
  }
  for (const element of exportClause.elements) {
    exportedNames.add(element.name.text);
  }
}

function collectDeclaredStatementName(statement: ts.Statement, declaredNames: Set<string>): void {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        declaredNames.add(declaration.name.text);
      }
    }
    return;
  }

  if (
    (ts.isClassDeclaration(statement) ||
      ts.isFunctionDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)) &&
    statement.name !== undefined
  ) {
    declaredNames.add(statement.name.text);
  }
}

function collectExportedDeclarationName(statement: ts.Statement, exportedNames: Set<string>): void {
  if (!ts.canHaveModifiers(statement)) {
    return;
  }
  const modifiers = ts.getModifiers(statement);
  if (
    modifiers === undefined ||
    !modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    return;
  }

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        exportedNames.add(declaration.name.text);
      }
    }
    return;
  }

  if (
    (ts.isClassDeclaration(statement) ||
      ts.isFunctionDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)) &&
    statement.name !== undefined
  ) {
    exportedNames.add(statement.name.text);
  }
}

async function createBoundedReadBasis(
  storage: MemoryStorage,
  graphName: string
): Promise<void> {
  const binding = resolveWarpStorage(storage);
  const runtime = await openRuntimeHostProduct({
    persistence: binding.history,
    runtimeStorage: binding.runtimeStorage,
    graphName,
    writerId: 'agent-1',
  });
  await runtime.materialize();
  await runtime.createCheckpoint();
}

describe('v19 Warp facade', () => {
  it('opens named timelines through root application nouns', async () => {
    const warp = await openWarp({
      storage: MemoryStorage.create(),
      writer: 'agent-1',
    });

    const timeline = await warp.timeline('events');

    expect(warp).toBeInstanceOf(Warp);
    expect(Object.isFrozen(warp)).toBe(true);
    expect(warp.writer).toBe('agent-1');
    expect(timeline).toBeInstanceOf(Timeline);
    expect(Object.isFrozen(timeline)).toBe(true);
    expect(timeline.name).toBe('events');
    expect(timeline.writer).toBe('agent-1');
  });

  it('keeps substrate graph, worldline, patch, optic, and hologram names off the root', () => {
    const rootExports = exportedNamesFor('index.ts');

    for (const name of FORBIDDEN_ROOT_SUBSTRATE_EXPORTS) {
      expect(rootExports.has(name)).toBe(false);
    }
  });

  it('keeps internal history vocabulary off the public facade objects', async () => {
    const warp = await openWarp({
      storage: MemoryStorage.create(),
      writer: 'agent-1',
    });
    const timeline = await warp.timeline('events');

    expect('worldlineName' in timeline).toBe(false);
    expect('writerId' in timeline).toBe(false);
    expect('commit' in timeline).toBe(false);
    expect('live' in timeline).toBe(false);
    expect('optic' in timeline).toBe(false);
    expect('coordinate' in timeline).toBe(false);
  });

  it('keeps worldline openers off the root export surface', async () => {
    const rootModule = await import('../../../index.ts');

    expect('openWarpWorldline' in rootModule).toBe(false);
  });

  it('rejects missing storage and blank identities', async () => {
    await expect(
      // @ts-expect-error runtime validation accepts JavaScript callers.
      openWarp(undefined)
    ).rejects.toThrow('openWarp options are required');

    await expect(
      openWarp({
        // @ts-expect-error runtime validation accepts JavaScript callers.
        storage: null,
        writer: 'agent-1',
      })
    ).rejects.toThrow('openWarp requires a WarpStorage handle');

    await expect(
      openWarp({
        storage: MemoryStorage.create(),
        writer: '   ',
      })
    ).rejects.toThrow('openWarp requires non-empty identity fields');

    const warp = await openWarp({
      storage: MemoryStorage.create(),
      writer: 'agent-1',
    });

    await expect(warp.timeline('')).rejects.toThrow('openWarp requires non-empty identity fields');
  });

  it('rejects invalid non-empty facade identities before opening timelines', async () => {
    await expect(
      openWarp({
        storage: MemoryStorage.create(),
        writer: 'agent 1',
      })
    ).rejects.toMatchObject({ code: 'E_INVALID_WRITER_ID' });

    const openedNames: string[] = [];
    const openTimeline = async (name: string): Promise<Timeline> => {
      openedNames.push(name);
      return new Timeline({ name, writer: 'agent-1' });
    };

    expect(
      () =>
        new Warp({
          writer: 'agent/1',
          openTimeline,
        })
    ).toThrow('Invalid writer ID: contains forward slash');

    const warp = new Warp({
      writer: 'agent-1',
      openTimeline,
    });

    await expect(warp.timeline('../events')).rejects.toMatchObject({
      code: 'E_INVALID_GRAPH_NAME',
    });
    expect(openedNames).toEqual([]);

    expect(
      () =>
        new Timeline({
          name: 'bad name',
          writer: 'agent-1',
        })
    ).toThrow('Invalid graph name: contains space');

    expect(
      () =>
        new Timeline({
          name: 'events',
          writer: 'x'.repeat(MAX_WRITER_ID_LENGTH + 1),
        })
    ).toThrow('Invalid writer ID: exceeds maximum length');
  });

  it('writes public intents and returns accepted write receipts', async () => {
    const warp = await openWarp({
      storage: MemoryStorage.create(),
      writer: 'agent-1',
    });
    const timeline = await warp.timeline('events');

    const nodeReceipt = await timeline.write(intent.node.add({ subject: 'user:alice' }));
    const propertyReceipt = await timeline.write(
      intent.property.set({
        subject: 'user:alice',
        key: 'role',
        value: 'admin',
      })
    );

    expect(nodeReceipt.outcome).toBe('accepted');
    expect(nodeReceipt.operation).toBe('write');
    expect(nodeReceipt.intent.kind).toBe('node.add');
    expect(typeof nodeReceipt.patchSha).toBe('string');
    expect(propertyReceipt.outcome).toBe('accepted');
    expect(propertyReceipt.intent.kind).toBe('property.set');
    expect(propertyReceipt.timeline).toBe('events');
    expect(propertyReceipt.writer).toBe('agent-1');

    const result = await requireTimelineRuntime(timeline)
      .live()
      .query()
      .match('user:*')
      .select(['id', 'props'])
      .run();

    expect('nodes' in result).toBe(true);
    if (!('nodes' in result)) {
      throw new Error('query result must include nodes');
    }
    expect(result.nodes).toEqual([{ id: 'user:alice', props: { role: 'admin' } }]);
  });

  it('detaches property intents from caller-owned recursive values', () => {
    const bytes = new Uint8Array([1, 2]);
    const source = {
      roles: ['admin'],
      evidence: bytes,
    };
    const propertyIntent = intent.property.set({
      subject: 'user:alice',
      key: 'access',
      value: source,
    });

    source.roles[0] = 'owner';
    bytes[0] = 9;
    const exposed = propertyIntent.descriptor;
    expect(exposed).toMatchObject({
      kind: 'property.set',
      value: { roles: ['admin'], evidence: new Uint8Array([1, 2]) },
    });
    if (exposed.kind !== 'property.set') {
      throw new Error('property intent descriptor kind must be stable');
    }
    const exposedValue = exposed.value as { roles: string[]; evidence: Uint8Array };
    exposedValue.roles[0] = 'auditor';
    exposedValue.evidence[0] = 7;

    expect(propertyIntent.descriptor).toMatchObject({
      kind: 'property.set',
      value: { roles: ['admin'], evidence: new Uint8Array([1, 2]) },
    });
  });

  it('returns operational write failures as receipts', async () => {
    const warp = await openWarp({
      storage: MemoryStorage.create(),
      writer: 'agent-1',
    });
    const timeline = await warp.timeline('events');

    const receipt = await timeline.write(intent.node.remove({ subject: 'user:alice' }));

    expect(receipt).toMatchObject({
      operation: 'write',
      outcome: 'obstructed',
      patchSha: undefined,
      reason: 'missing_write_basis',
    });
    expect(receipt.repairHints).toEqual([
      expect.objectContaining({ code: 'materialize_write_basis' }),
    ]);
  });

  it('reads public readings and returns accepted read receipts', async () => {
    const storage = MemoryStorage.create();
    const warp = await openWarp({
      storage,
      writer: 'agent-1',
    });
    const timeline = await warp.timeline('events');

    await timeline.write(intent.node.add({ subject: 'user:alice' }));
    await timeline.write(
      intent.property.set({
        subject: 'user:alice',
        key: 'role',
        value: 'admin',
      })
    );
    await timeline.write(intent.node.add({ subject: 'team:ops' }));
    await timeline.write(
      intent.edge.add({
        from: 'user:alice',
        to: 'team:ops',
        label: 'memberOf',
      })
    );
    await createBoundedReadBasis(storage, timeline.name);

    const propertyResult = await timeline.read(
      reading.property({
        subject: 'user:alice',
        key: 'role',
      })
    );
    const existsResult = await timeline.read(
      reading.node.exists({
        subject: 'user:alice',
      })
    );
    const neighborhoodResult = await timeline.read(
      reading.neighborhood({
        subject: 'user:alice',
        direction: 'out',
        labels: ['memberOf'],
      })
    );

    expect(propertyResult).toBeInstanceOf(ReadingResult);
    expect(propertyResult.receipt).toBeInstanceOf(ReadReceipt);
    expect(propertyResult.value).toBe('admin');
    expect(propertyResult.receipt.outcome).toBe('accepted');
    expect(propertyResult.receipt.operation).toBe('read');
    expect(propertyResult.receipt.reading.kind).toBe('property.get');
    expect(propertyResult.receipt.timeline).toBe('events');
    expect(propertyResult.receipt.writer).toBe('agent-1');
    expect(propertyResult.receipt.evidence).toMatchObject({
      kind: 'checkpoint-tail-read',
      worldline: 'events',
    });

    expect(existsResult).toBeInstanceOf(ReadingResult);
    expect(existsResult.value).toBe(true);
    expect(existsResult.receipt.outcome).toBe('accepted');
    expect(existsResult.receipt.reading.kind).toBe('node.exists');
    expect(neighborhoodResult.value).toMatchObject({
      subject: 'user:alice',
      direction: 'out',
      completeness: 'complete',
      edges: [{ direction: 'out', neighborId: 'team:ops', label: 'memberOf' }],
    });
    expect(neighborhoodResult.receipt).toMatchObject({
      outcome: 'accepted',
      evidence: { kind: 'checkpoint-tail-read' },
    });
    const coordinate = await captureCoordinate(timeline);
    const coordinateRole = await coordinate.optic().node('user:alice').prop('role').read();
    expect(coordinateRole.value).toBe('admin');
    await expect(
      timeline.readValue(
        reading.property({
          subject: 'user:alice',
          key: 'role',
        })
      )
    ).resolves.toBe('admin');

    const tick = await timeline.tick();
    const secondWarp = await openWarp({ storage, writer: 'agent-2' });
    const sameNamedForeignTimeline = await secondWarp.timeline('events');
    expect(() => sameNamedForeignTimeline.at(tick)).toThrow(
      'Tick does not belong to this Timeline'
    );
    await timeline.write(
      intent.property.set({
        subject: 'user:alice',
        key: 'role',
        value: 'owner',
      })
    );
    const currentRole = await timeline.readValue(
      reading.property({
        subject: 'user:alice',
        key: 'role',
      })
    );
    const historicalRole = await timeline.at(tick).readValue(
      reading.property({
        subject: 'user:alice',
        key: 'role',
      })
    );
    expect(currentRole).toBe('owner');
    expect(historicalRole).toBe('admin');
  });

  it('returns an obstructed receipt instead of materializing a missing read basis', async () => {
    const warp = await openWarp({
      storage: MemoryStorage.create(),
      writer: 'agent-1',
    });
    const timeline = await warp.timeline('events');

    const result = await timeline.read(reading.node.exists({ subject: 'user:alice' }));

    expect(result.value).toBeNull();
    expect(result.receipt).toMatchObject({
      outcome: 'obstructed',
      reason: 'missing_bounded_basis',
    });
    expect(result.receipt.evidence).toBeUndefined();
    expect(result.receipt.repairHints).toEqual([
      expect.objectContaining({ code: 'repair_bounded_basis' }),
    ]);
    await expect(
      timeline.readValue(reading.node.exists({ subject: 'user:alice' }))
    ).rejects.toMatchObject({ code: 'E_TIMELINE_READ_UNRESOLVED' });
  });

  it('drafts speculative writes, previews joins, and joins with receipts', async () => {
    const storage = MemoryStorage.create();
    const warp = await openWarp({
      storage,
      writer: 'agent-1',
    });
    const timeline = await warp.timeline('events');

    await timeline.write(intent.node.add({ subject: 'user:alice' }));
    await createBoundedReadBasis(storage, timeline.name);
    const draft = await timeline.draft('try-admin-role');

    const draftWrite = await draft.write(
      intent.property.set({
        subject: 'user:alice',
        key: 'role',
        value: 'admin',
      })
    );
    const beforeJoin = await timeline.read(
      reading.property({
        subject: 'user:alice',
        key: 'role',
      })
    );
    const preview = await timeline.previewJoin(draft, {
      policy: 'deterministic',
    });
    const afterPreview = await timeline.read(
      reading.property({
        subject: 'user:alice',
        key: 'role',
      })
    );
    const joined = await timeline.join(draft);
    const afterJoin = await timeline.read(
      reading.property({
        subject: 'user:alice',
        key: 'role',
      })
    );

    expect(draft).toBeInstanceOf(DraftTimeline);
    expect(draft.name).toBe('try-admin-role');
    expect(draft.timeline).toBe('events');
    expect(draft.writer).toBe('agent-1');
    expect(draftWrite.outcome).toBe('accepted');
    expect(beforeJoin.value).toBeNull();
    expect(preview).toBeInstanceOf(JoinResult);
    expect(preview.receipt).toBeInstanceOf(JoinReceipt);
    expect(preview.receipt.mode).toBe('preview');
    expect(preview.receipt.outcome).toBe('accepted');
    expect(preview.receipt.patchShas).toContain(draftWrite.patchSha);
    expect(afterPreview.value).toBeNull();
    expect(joined).toBeInstanceOf(JoinResult);
    expect(joined.receipt.mode).toBe('join');
    expect(joined.receipt.outcome).toBe('accepted');
    expect(joined.receipt.patchShas).toHaveLength(1);
    expect(afterJoin.value).toBe('admin');
  });

  it('names the openWarp identity failure payload once', () => {
    expect(OPEN_WARP_IDENTITY_FAILURE).toEqual({
      message: 'openWarp requires non-empty identity fields',
      code: 'E_OPEN_WARP_IDENTITY',
    });
  });

  it('keeps identity validation in the dedicated validator module', () => {
    const warpNames = allDeclaredNamesFor('src/domain/api/Warp.ts');
    const timelineNames = allDeclaredNamesFor('src/domain/api/Timeline.ts');
    const validatorExports = exportedNamesFor('src/domain/api/assertIdentity.ts');

    expect(warpNames.has('assertNonEmpty')).toBe(false);
    expect(timelineNames.has('assertTimelineIdentity')).toBe(false);
    expect(validatorExports.has('assertIdentity')).toBe(true);
  });

  it('rejects invalid public facade constructor options with domain errors', () => {
    expect(() => {
      // @ts-expect-error runtime validation accepts JavaScript callers.
      new Warp(null);
    }).toThrow('Warp requires construction options');

    expect(() => {
      // @ts-expect-error runtime validation accepts JavaScript callers.
      new Warp({ writer: 'agent-1' });
    }).toThrow('Warp requires an openTimeline function');

    expect(() => {
      // @ts-expect-error runtime validation accepts JavaScript callers.
      new Timeline(null);
    }).toThrow('Timeline requires construction options');
  });
});
