import { Buffer } from 'node:buffer';
import { open, readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { createBackend } from './backends.mjs';

const options = Object.freeze({
  backend: requiredOption('--backend'),
  batchBytes: integerOption('--batch-bytes'),
  gitDir: requiredOption('--git-dir'),
  input: stringOption('--input'),
  manifest: stringOption('--manifest'),
  operationCount: integerOption('--operations'),
  payloadBytes: integerOption('--payload-bytes'),
  scenario: requiredOption('--scenario'),
});

if (!['blob-read', 'blob-write'].includes(options.scenario)) {
  throw new Error('--scenario must be blob-read or blob-write');
}

const fixture = Object.freeze({
  gitDir: options.gitDir,
  objectFormat: 'sha1',
  oidBytes: 20,
  payloadBytes: options.payloadBytes,
  payloadProfile: 'random',
});
const backend = await createBackend(options.backend, fixture);

try {
  const started = performance.now();
  const result =
    options.scenario === 'blob-write'
      ? await writeCorpus(backend, options)
      : await readCorpus(backend, options);
  const operationWallMs = performance.now() - started;
  process.stdout.write(`${JSON.stringify({ operationWallMs, ...result })}\n`);
} finally {
  await backend.close();
}

async function writeCorpus(backendInstance, settings) {
  if (!backendInstance.capabilities.writeBlob || settings.input === null) {
    throw new Error(`${backendInstance.name} cannot run the streamed blob-write workload`);
  }
  const contents = readChunks(settings.input, settings.operationCount, settings.payloadBytes);
  const oids =
    typeof backendInstance.writeBlobs === 'function'
      ? await backendInstance.writeBlobs(contents)
      : await writeSequentially(backendInstance, contents);
  if (oids.length !== settings.operationCount) {
    throw new Error(`${backendInstance.name} returned ${oids.length} object identifiers`);
  }
  return Object.freeze({ checksum: checksumOids(oids), oids });
}

async function readCorpus(backendInstance, settings) {
  if (!backendInstance.capabilities.readBlob || settings.manifest === null) {
    throw new Error(`${backendInstance.name} cannot run the streamed blob-read workload`);
  }
  const manifest = JSON.parse(await readFile(settings.manifest, 'utf8'));
  if (!Array.isArray(manifest.oids) || manifest.oids.length < settings.operationCount) {
    throw new Error('Read manifest does not contain enough object identifiers');
  }
  let checksum = 0;
  const batchSize = Math.max(1, Math.floor(settings.batchBytes / settings.payloadBytes));
  for (let start = 0; start < settings.operationCount; start += batchSize) {
    const oids = manifest.oids.slice(start, Math.min(settings.operationCount, start + batchSize));
    if (typeof backendInstance.readBlobs === 'function') {
      const contents = await backendInstance.readBlobs(oids);
      for (let offset = 0; offset < contents.length; offset += 1) {
        checksum = consumeContent(
          checksum,
          contents[offset],
          start + offset,
          backendInstance,
          settings
        );
      }
    } else {
      for (let offset = 0; offset < oids.length; offset += 1) {
        const oid = oids[offset];
        const content = await backendInstance.readBlob(oid);
        checksum = consumeContent(checksum, content, start + offset, backendInstance, settings);
      }
    }
  }
  return Object.freeze({ checksum });
}

function consumeContent(checksum, content, expectedIndex, backendInstance, settings) {
  if (content.length !== settings.payloadBytes) {
    throw new Error(`${backendInstance.name} returned an unexpected blob size`);
  }
  if (content.readBigUInt64BE(0) !== BigInt(expectedIndex)) {
    throw new Error(`${backendInstance.name} returned an unexpected blob at ${expectedIndex}`);
  }
  return (checksum + content.length + content[0] + content[content.length - 1]) >>> 0;
}

async function writeSequentially(backendInstance, contents) {
  const oids = [];
  for await (const content of contents) {
    oids.push(await backendInstance.writeBlob(content));
  }
  return Object.freeze(oids);
}

async function* readChunks(path, count, byteLength) {
  const handle = await open(path, 'r');
  try {
    for (let index = 0; index < count; index += 1) {
      const content = Buffer.allocUnsafe(byteLength);
      let offset = 0;
      while (offset < byteLength) {
        const { bytesRead } = await handle.read(
          content,
          offset,
          byteLength - offset,
          index * byteLength + offset
        );
        if (bytesRead === 0) {
          throw new Error(`Input corpus ended during object ${index}`);
        }
        offset += bytesRead;
      }
      yield content;
    }
  } finally {
    await handle.close();
  }
}

function checksumOids(oids) {
  let checksum = 0;
  for (const oid of oids) {
    checksum = (checksum + Number.parseInt(oid.slice(0, 8), 16)) >>> 0;
  }
  return checksum;
}

function requiredOption(name) {
  const value = stringOption(name);
  if (value === null) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function integerOption(name) {
  const value = Number(requiredOption(name));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

function stringOption(name) {
  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === name) {
      const value = process.argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${name} requires a value`);
      }
      return value;
    }
    if (argument?.startsWith(`${name}=`)) {
      return argument.slice(name.length + 1);
    }
  }
  return null;
}
