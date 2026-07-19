import { Buffer } from 'node:buffer';
import {
  executeGit,
  FastImportWriter,
  parseLsTreeEntry,
  parseRawTree,
  PersistentCatFile,
  PersistentMktree,
} from './git-process.mjs';

const OBJECT_INFO_FORMAT = '--batch-check=%(objectname) %(objecttype) %(objectsize)';

export const BACKEND_NAMES = Object.freeze([
  'git-one-shot',
  'git-persistent',
  'git-persistent-tree-cache',
  'git-persistent-session-cache',
  'git-persistent-mktree',
  'git-fast-import-batch',
  'git-fast-import-pack',
  'nodegit',
  'napi-libgit2',
  'isomorphic-git',
]);

export const ALL_BACKEND_NAMES = Object.freeze([
  ...BACKEND_NAMES,
  'git-persistent-mmap-1m',
  'git-persistent-mmap-8m',
  'git-persistent-mmap-16m',
  'git-persistent-buffered',
  'git-fast-import-no-delta',
  'git-fast-import-no-delta-zlib1',
  'git-fast-import-no-delta-uncompressed',
]);

export async function createBackend(name, fixture) {
  switch (name) {
    case 'git-one-shot':
      return createOneShotBackend(fixture);
    case 'git-persistent':
      return createPersistentBackend(fixture, {
        cacheRefs: false,
        cacheTrees: false,
        name: 'git-persistent',
      });
    case 'git-persistent-mmap-1m':
      return createPersistentBackend(fixture, {
        cacheRefs: false,
        cacheTrees: false,
        gitConfig: ['core.packedGitWindowSize=1m', 'core.packedGitLimit=16m'],
        name: 'git-persistent-mmap-1m',
      });
    case 'git-persistent-mmap-8m':
      return createPersistentBackend(fixture, {
        cacheRefs: false,
        cacheTrees: false,
        gitConfig: ['core.packedGitWindowSize=8m', 'core.packedGitLimit=32m'],
        name: 'git-persistent-mmap-8m',
      });
    case 'git-persistent-mmap-16m':
      return createPersistentBackend(fixture, {
        cacheRefs: false,
        cacheTrees: false,
        gitConfig: ['core.packedGitWindowSize=16m', 'core.packedGitLimit=64m'],
        name: 'git-persistent-mmap-16m',
      });
    case 'git-persistent-buffered':
      return createPersistentBackend(fixture, {
        batchReads: true,
        cacheRefs: false,
        cacheTrees: false,
        gitConfig: ['core.packedGitWindowSize=8m', 'core.packedGitLimit=32m'],
        name: 'git-persistent-buffered',
      });
    case 'git-persistent-tree-cache':
      return createPersistentBackend(fixture, {
        cacheRefs: false,
        cacheTrees: true,
        name: 'git-persistent-tree-cache',
      });
    case 'git-persistent-session-cache':
      return createPersistentBackend(fixture, {
        cacheRefs: true,
        cacheTrees: true,
        name: 'git-persistent-session-cache',
      });
    case 'git-persistent-mktree':
      return createPersistentBackend(fixture, {
        batchTrees: true,
        cacheRefs: false,
        cacheTrees: true,
        name: 'git-persistent-mktree',
      });
    case 'git-fast-import-batch':
      return createFastImportBackend(fixture, 'git-fast-import-batch');
    case 'git-fast-import-pack':
      return createFastImportBackend(fixture, 'git-fast-import-pack', { unpackLimit: 0 });
    case 'git-fast-import-no-delta':
      return createFastImportBackend(fixture, 'git-fast-import-no-delta', {
        fastImportArguments: ['--big-file-threshold=1'],
        unpackLimit: 0,
      });
    case 'git-fast-import-no-delta-zlib1':
      return createFastImportBackend(fixture, 'git-fast-import-no-delta-zlib1', {
        config: ['pack.compression=1'],
        fastImportArguments: ['--big-file-threshold=1'],
        unpackLimit: 0,
      });
    case 'git-fast-import-no-delta-uncompressed':
      return createFastImportBackend(fixture, 'git-fast-import-no-delta-uncompressed', {
        config: ['pack.compression=0'],
        fastImportArguments: ['--big-file-threshold=1'],
        unpackLimit: 0,
      });
    case 'nodegit':
      return await createNodeGitBackend(fixture);
    case 'napi-libgit2':
      return await createNapiBackend(fixture);
    case 'isomorphic-git':
      return await createIsomorphicBackend(fixture);
    default:
      throw new Error(`Unknown backend: ${name}`);
  }
}

function createFastImportBackend(fixture, name, options = {}) {
  return Object.freeze({
    capabilities: capabilities({
      objectInfo: false,
      readBlob: false,
      readTreeEntry: false,
      resolveRef: false,
      writeTree: false,
    }),
    close: async () => {},
    name,
    async writeBlob(content) {
      return (await this.writeBlobs([content]))[0];
    },
    async writeBlobs(contents) {
      const writer = new FastImportWriter(fixture.gitDir, options);
      return await writer.writeAll(contents);
    },
  });
}

function createOneShotBackend(fixture) {
  return Object.freeze({
    capabilities: capabilities(),
    close: async () => {},
    name: 'git-one-shot',
    async objectInfo(oid) {
      const output = await executeGit(fixture.gitDir, ['cat-file', OBJECT_INFO_FORMAT], {
        input: `${oid}\n`,
      });
      return parseObjectInfo(output, oid);
    },
    async readBlob(oid) {
      return await executeGit(fixture.gitDir, ['cat-file', 'blob', oid], {
        encoding: null,
      });
    },
    async readTreeEntry(treeOid, name) {
      const output = await executeGit(fixture.gitDir, ['ls-tree', '-z', treeOid, '--', name], {
        encoding: null,
      });
      if (output.length === 0) {
        return null;
      }
      return parseLsTreeEntry(output);
    },
    async resolveRef(refName) {
      return (
        await executeGit(fixture.gitDir, ['rev-parse', '--verify', '--quiet', refName])
      ).trim();
    },
    async writeBlob(content) {
      return (
        await executeGit(fixture.gitDir, ['hash-object', '-w', '--stdin'], {
          input: content,
        })
      ).trim();
    },
    async writeTree(entries) {
      return (
        await executeGit(fixture.gitDir, ['mktree'], {
          input: `${formatTreeEntries(entries)}\n`,
        })
      ).trim();
    },
  });
}

function createPersistentBackend(
  fixture,
  { batchReads = false, batchTrees = false, cacheRefs, cacheTrees, gitConfig = [], name }
) {
  const catFile = new PersistentCatFile(fixture.gitDir, {
    buffered: batchReads,
    config: gitConfig,
  });
  const mktree = batchTrees ? new PersistentMktree(fixture.gitDir) : null;
  const refs = new Map();
  const trees = new Map();
  const backend = {
    capabilities: capabilities(),
    close: async () => {
      await Promise.all([catFile.close(), mktree?.close()]);
    },
    name,
    async objectInfo(oid) {
      return await catFile.info(oid);
    },
    async readBlob(oid) {
      const object = await catFile.contents(oid);
      if (object.type !== 'blob') {
        throw new Error(`Expected blob ${oid}, received ${object.type}`);
      }
      return object.content;
    },
    async readTreeEntry(treeOid, name) {
      let entries = trees.get(treeOid);
      if (entries === undefined) {
        const object = await catFile.contents(treeOid);
        if (object.type !== 'tree') {
          throw new Error(`Expected tree ${treeOid}, received ${object.type}`);
        }
        entries = parseRawTree(object.content, fixture.oidBytes);
        if (cacheTrees) {
          trees.set(treeOid, entries);
        }
      }
      return entries.find((entry) => entry.name === name) ?? null;
    },
    async resolveRef(refName) {
      const cached = refs.get(refName);
      if (cached !== undefined) {
        return cached;
      }
      const target = (
        await executeGit(fixture.gitDir, ['rev-parse', '--verify', '--quiet', refName])
      ).trim();
      if (cacheRefs) {
        refs.set(refName, target);
      }
      return target;
    },
    async writeBlob(content) {
      return (
        await executeGit(fixture.gitDir, ['hash-object', '-w', '--stdin'], {
          input: content,
        })
      ).trim();
    },
    async writeTree(entries) {
      if (mktree !== null) {
        return await mktree.write(formatTreeEntries(entries).split('\n'));
      }
      return (
        await executeGit(fixture.gitDir, ['mktree'], {
          input: `${formatTreeEntries(entries)}\n`,
        })
      ).trim();
    },
  };
  if (batchReads) {
    backend.readBlobs = async (oids) => {
      const objects = await catFile.contentsMany(oids);
      return Object.freeze(
        objects.map((object, index) => {
          if (object.type !== 'blob') {
            throw new Error(`Expected blob ${oids[index]}, received ${object.type}`);
          }
          return object.content;
        })
      );
    };
  }
  return Object.freeze(backend);
}

async function createNodeGitBackend(fixture) {
  const { default: NodeGitImport } = await import('nodegit');
  const NodeGit = NodeGitImport;
  const repository = await NodeGit.Repository.open(fixture.gitDir);
  const odb = await repository.odb();
  return Object.freeze({
    capabilities: capabilities(),
    close: async () => {},
    name: 'nodegit',
    async objectInfo(oid) {
      const object = await odb.read(oid);
      return Object.freeze({
        oid,
        size: object.size(),
        type: nodeGitObjectType(NodeGit, object.type()),
      });
    },
    async readBlob(oid) {
      const object = await odb.read(oid);
      if (object.type() !== NodeGit.Object.TYPE.BLOB) {
        throw new Error(`Expected NodeGit blob ${oid}`);
      }
      return object.data().toBuffer(object.size());
    },
    async readTreeEntry(treeOid, name) {
      const tree = await repository.getTree(treeOid);
      let entry;
      try {
        entry = tree.entryByName(name);
      } catch (error) {
        if (error?.errno === NodeGit.Error.CODE.ENOTFOUND) {
          return null;
        }
        throw error;
      }
      return Object.freeze({
        mode: entry.filemode().toString(8).padStart(6, '0'),
        name: entry.name(),
        oid: entry.sha(),
        type: nodeGitObjectType(NodeGit, entry.type()),
      });
    },
    async resolveRef(refName) {
      const reference = await repository.getReference(refName);
      return reference.target().tostrS();
    },
    async writeBlob(content) {
      const oid = await repository.createBlobFromBuffer(content);
      return oid.tostrS();
    },
    async writeTree(entries) {
      const builder = await NodeGit.Treebuilder.create(repository, null);
      for (const entry of entries) {
        builder.insert(entry.name, entry.oid, Number.parseInt(entry.mode, 8));
      }
      return (await builder.write()).tostrS();
    },
  });
}

async function createNapiBackend(fixture) {
  const NapiGit = await import('@napi-rs/simple-git');
  const repository = new NapiGit.Repository(fixture.gitDir);
  return Object.freeze({
    capabilities: capabilities({
      objectInfo: false,
      readBlob: false,
      resolveRef: false,
      writeTree: false,
    }),
    close: async () => repository.dispose(),
    name: 'napi-libgit2',
    async readTreeEntry(treeOid, name) {
      const tree = repository.findTree(treeOid);
      if (tree === null) {
        throw new Error(`NAPI libgit2 tree is missing: ${treeOid}`);
      }
      const entry = tree.getName(name);
      if (entry === null) {
        return null;
      }
      const object = entry.toObject(repository);
      return Object.freeze({
        mode: null,
        name: entry.name(),
        oid: entry.id(),
        type: napiObjectType(NapiGit, object.kind()),
      });
    },
    async writeBlob(content) {
      return repository.blob(content);
    },
  });
}

async function createIsomorphicBackend(fixture) {
  const [{ default: fs }, { default: git }] = await Promise.all([
    import('node:fs'),
    import('isomorphic-git'),
  ]);
  return Object.freeze({
    capabilities: capabilities(),
    close: async () => {},
    name: 'isomorphic-git',
    async objectInfo(oid) {
      const object = await git.readObject({ fs, gitdir: fixture.gitDir, oid, format: 'content' });
      return Object.freeze({ oid, size: object.object.length, type: object.type });
    },
    async readBlob(oid) {
      const object = await git.readObject({ fs, gitdir: fixture.gitDir, oid, format: 'content' });
      if (object.type !== 'blob') {
        throw new Error(`Expected isomorphic-git blob ${oid}, received ${object.type}`);
      }
      return Buffer.from(object.object);
    },
    async readTreeEntry(treeOid, name) {
      const tree = await git.readTree({ fs, gitdir: fixture.gitDir, oid: treeOid });
      const entry = tree.tree.find((candidate) => candidate.path === name);
      if (entry === undefined) {
        return null;
      }
      return Object.freeze({
        mode: entry.mode,
        name: entry.path,
        oid: entry.oid,
        type: entry.type,
      });
    },
    async resolveRef(refName) {
      return await git.resolveRef({ fs, gitdir: fixture.gitDir, ref: refName });
    },
    async writeBlob(content) {
      return await git.writeBlob({ fs, gitdir: fixture.gitDir, blob: content });
    },
    async writeTree(entries) {
      return await git.writeTree({
        fs,
        gitdir: fixture.gitDir,
        tree: entries.map((entry) => ({
          mode: entry.mode,
          oid: entry.oid,
          path: entry.name,
          type: entry.type,
        })),
      });
    },
  });
}

function capabilities(overrides = {}) {
  return Object.freeze({
    objectInfo: true,
    readBlob: true,
    readTreeEntry: true,
    resolveRef: true,
    writeBlob: true,
    writeTree: true,
    ...overrides,
  });
}

function parseObjectInfo(output, expectedOid) {
  const fields = output.trim().split(' ');
  const size = Number(fields[2]);
  if (fields.length !== 3 || fields[0] !== expectedOid || !Number.isSafeInteger(size) || size < 0) {
    throw new Error(`Malformed object-info response: ${JSON.stringify(output)}`);
  }
  return Object.freeze({ oid: fields[0], type: fields[1], size });
}

function nodeGitObjectType(NodeGit, type) {
  switch (type) {
    case NodeGit.Object.TYPE.BLOB:
      return 'blob';
    case NodeGit.Object.TYPE.TREE:
      return 'tree';
    case NodeGit.Object.TYPE.COMMIT:
      return 'commit';
    case NodeGit.Object.TYPE.TAG:
      return 'tag';
    default:
      throw new Error(`Unsupported NodeGit object type: ${String(type)}`);
  }
}

function napiObjectType(NapiGit, type) {
  switch (type) {
    case NapiGit.ObjectType.Blob:
      return 'blob';
    case NapiGit.ObjectType.Tree:
      return 'tree';
    case NapiGit.ObjectType.Commit:
      return 'commit';
    case NapiGit.ObjectType.Tag:
      return 'tag';
    default:
      throw new Error(`Unsupported NAPI libgit2 object type: ${String(type)}`);
  }
}

function formatTreeEntries(entries) {
  return entries
    .map((entry) => `${entry.mode} ${entry.type} ${entry.oid}\t${entry.name}`)
    .join('\n');
}
