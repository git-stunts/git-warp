import { afterEach, describe, expect, it } from 'vitest';

import V18MigrationGraphCatalog from '../../../scripts/v18-to-v19/V18MigrationGraphCatalog.ts';
import { CURRENT_SUBSTRATE_MARKER } from '../../../src/infrastructure/adapters/SubstrateVersionGate.ts';
import { gitOk, MigrationTestDirectories } from './migrationTestEnvironment.ts';

describe('v18 migration graph catalog', () => {
  const directories = new MigrationTestDirectories();

  afterEach(async () => {
    await directories.cleanup();
  });

  it('discovers multiple and nested graph namespaces with version posture', async () => {
    const repositoryPath = await initializedRepository(directories);
    const legacyOid = await writeBlob(repositoryPath, 'legacy');
    const currentMarkerOid = await writeBlob(repositoryPath, CURRENT_SUBSTRATE_MARKER);
    const unsupportedMarkerOid = await writeBlob(repositoryPath, 'future-marker');

    await writeRef(repositoryPath, 'refs/warp/notes/writers/local', legacyOid);
    await writeRef(repositoryPath, 'refs/warp/team/writers/alice', legacyOid);
    await writeRef(repositoryPath, 'refs/warp/team/recovery/old/refs/writers/ghost', legacyOid);
    await writeRef(repositoryPath, 'refs/warp/team/events/writers/bob', legacyOid);
    await writeRef(repositoryPath, 'refs/warp/team/events/writers/charlie', legacyOid);
    await writeRef(repositoryPath, 'refs/warp/team/events/substrate-version', currentMarkerOid);
    await writeRef(repositoryPath, 'refs/warp/future/writers/next', legacyOid);
    await writeRef(repositoryPath, 'refs/warp/future/substrate-version', unsupportedMarkerOid);

    const catalog = await V18MigrationGraphCatalog.discover(repositoryPath);

    expect(catalog.graphs.map((graph) => graph.summary())).toEqual([
      'future — unsupported marker (future-marker); 1 writer; 2 refs',
      'notes — upgrade required (legacy unmarked substrate); 1 writer; 1 ref',
      'team — upgrade required (legacy unmarked substrate); 1 writer; 1 ref',
      'team/events — v19 current; 2 writers; 3 refs',
    ]);
    expect(catalog.require('team').refCount).toBe(1);
    expect(catalog.require('team/events').writerCount).toBe(2);
  });

  it('reports Graph not found and lists the namespaces that do exist', async () => {
    const repositoryPath = await initializedRepository(directories);
    const oid = await writeBlob(repositoryPath, 'legacy');
    await writeRef(repositoryPath, 'refs/warp/think/writers/local', oid);
    await writeRef(repositoryPath, 'refs/warp/archive/writers/local', oid);

    const catalog = await V18MigrationGraphCatalog.discover(repositoryPath);

    expect(() => catalog.require('events')).toThrow(
      /Graph not found: events[\s\S]*archive — upgrade required[\s\S]*think — upgrade required/u
    );
  });

  it('distinguishes an empty repository from an empty named graph', async () => {
    const repositoryPath = await initializedRepository(directories);
    const catalog = await V18MigrationGraphCatalog.discover(repositoryPath);

    expect(catalog.summary()).toBe('Graphs found: none');
    expect(() => catalog.require('events')).toThrow('Graph not found: events\nGraphs found: none');
  });
});

async function initializedRepository(directories: MigrationTestDirectories): Promise<string> {
  const repositoryPath = await directories.create('git-warp-graph-catalog-');
  await gitOk(repositoryPath, ['init', '--bare']);
  return repositoryPath;
}

async function writeBlob(repositoryPath: string, value: string): Promise<string> {
  return await gitOk(repositoryPath, ['hash-object', '-w', '--stdin'], value);
}

async function writeRef(repositoryPath: string, refName: string, oid: string): Promise<void> {
  await gitOk(repositoryPath, ['update-ref', refName, oid]);
}
