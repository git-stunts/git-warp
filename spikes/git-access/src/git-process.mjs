import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import process from 'node:process';

export async function executeGit(gitDir, args, options = {}) {
  const child = spawn('git', gitDir === null ? args : ['--git-dir', gitDir, ...args], {
    env: options.env ?? process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const maxBuffer = options.maxBuffer ?? 256 * 1024 * 1024;
  const stdout = collectBoundedStream(child.stdout, maxBuffer, 'stdout');
  const stderr = collectBoundedStream(child.stderr, maxBuffer, 'stderr');
  if (options.input === undefined) {
    child.stdin.end();
  } else {
    child.stdin.end(options.input);
  }
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  const [stdoutBytes, stderrBytes] = await Promise.all([stdout, stderr]);
  if (code !== 0) {
    throw new Error(
      `git ${args.join(' ')} exited ${String(code)}: ${stderrBytes.toString('utf8')}`
    );
  }
  return options.encoding === null ? stdoutBytes : stdoutBytes.toString(options.encoding ?? 'utf8');
}

export function parseLsTreeEntry(output) {
  const record = Buffer.isBuffer(output) ? output.toString('utf8') : output;
  const value = record.replace(/\0+$/u, '');
  const tab = value.indexOf('\t');
  if (tab === -1) {
    throw new Error(`Malformed ls-tree entry: ${JSON.stringify(value)}`);
  }
  const [mode, type, oid] = value.slice(0, tab).split(' ');
  if (mode === undefined || type === undefined || oid === undefined) {
    throw new Error(`Malformed ls-tree metadata: ${JSON.stringify(value)}`);
  }
  return Object.freeze({ mode, type, oid, name: value.slice(tab + 1) });
}

export function parseRawTree(buffer, oidBytes) {
  const entries = [];
  let offset = 0;
  while (offset < buffer.length) {
    const modeEnd = buffer.indexOf(0x20, offset);
    if (modeEnd === -1) {
      throw new Error('Raw tree entry is missing its mode separator');
    }
    const nameEnd = buffer.indexOf(0x00, modeEnd + 1);
    if (nameEnd === -1) {
      throw new Error('Raw tree entry is missing its name terminator');
    }
    const oidEnd = nameEnd + 1 + oidBytes;
    if (oidEnd > buffer.length) {
      throw new Error('Raw tree entry has a truncated object identifier');
    }
    const rawMode = buffer.subarray(offset, modeEnd).toString('ascii');
    const mode = rawMode.padStart(6, '0');
    const name = buffer.subarray(modeEnd + 1, nameEnd).toString('utf8');
    const oid = buffer.subarray(nameEnd + 1, oidEnd).toString('hex');
    entries.push(
      Object.freeze({
        mode,
        type: mode === '040000' ? 'tree' : mode === '160000' ? 'commit' : 'blob',
        oid,
        name,
      })
    );
    offset = oidEnd;
  }
  return Object.freeze(entries);
}

export class PersistentCatFile {
  #buffered;
  #child;
  #closed = false;
  #exit;
  #reader;
  #stderr;
  #tail = Promise.resolve();

  constructor(gitDir, { buffered = false, config = [] } = {}) {
    const configArguments = config.flatMap((entry) => ['-c', entry]);
    const batchArguments = buffered ? ['--batch-command', '--buffer'] : ['--batch-command'];
    this.#buffered = buffered;
    this.#child = spawn(
      'git',
      ['--git-dir', gitDir, ...configArguments, 'cat-file', ...batchArguments],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    this.#reader = new ByteReader(this.#child.stdout);
    this.#stderr = collectStream(this.#child.stderr);
    this.#exit = new Promise((resolve, reject) => {
      this.#child.once('error', reject);
      this.#child.once('close', resolve);
    });
  }

  async info(oid) {
    return await this.#serialize(async () => {
      await this.#write(`info ${oid}\n`);
      await this.#flush();
      return parseInfoLine((await this.#reader.readLine()).toString('utf8'), oid);
    });
  }

  async contents(oid) {
    return await this.#serialize(async () => {
      await this.#write(`contents ${oid}\n`);
      await this.#flush();
      return await this.#readContents(oid);
    });
  }

  async contentsMany(oids) {
    return await this.#serialize(async () => {
      await this.#write(oids.map((oid) => `contents ${oid}\n`).join(''));
      await this.#flush();
      const objects = [];
      for (const oid of oids) {
        objects.push(await this.#readContents(oid));
      }
      return Object.freeze(objects);
    });
  }

  async close() {
    if (this.#closed) {
      return;
    }
    await this.#tail;
    this.#closed = true;
    this.#child.stdin.end();
    const [code, stderr] = await Promise.all([this.#exit, this.#stderr]);
    if (code !== 0) {
      throw new Error(`git cat-file exited ${String(code)}: ${stderr.toString('utf8')}`);
    }
  }

  async #serialize(operation) {
    const current = this.#tail.then(operation);
    this.#tail = current.catch(() => {});
    return await current;
  }

  async #write(command) {
    if (this.#closed) {
      throw new Error('git cat-file process is closed');
    }
    if (this.#child.stdin.write(command)) {
      return;
    }
    await waitForDrain(this.#child.stdin);
  }

  async #flush() {
    if (this.#buffered) {
      await this.#write('flush\n');
    }
  }

  async #readContents(oid) {
    const info = parseInfoLine((await this.#reader.readLine()).toString('utf8'), oid);
    const content = await this.#reader.readExactly(info.size);
    const terminator = await this.#reader.readExactly(1);
    if (terminator[0] !== 0x0a) {
      throw new Error(`cat-file response for ${oid} is missing its terminator`);
    }
    return Object.freeze({ ...info, content });
  }
}

export class PersistentMktree {
  #child;
  #closed = false;
  #exit;
  #reader;
  #stderr;
  #tail = Promise.resolve();

  constructor(gitDir) {
    this.#child = spawn('git', ['--git-dir', gitDir, 'mktree', '--batch'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#reader = new ByteReader(this.#child.stdout);
    this.#stderr = collectStream(this.#child.stderr);
    this.#exit = new Promise((resolve, reject) => {
      this.#child.once('error', reject);
      this.#child.once('close', resolve);
    });
  }

  async write(entries) {
    return await this.#serialize(async () => {
      const input = `${entries.join('\n')}\n\n`;
      if (!this.#child.stdin.write(input)) {
        await waitForDrain(this.#child.stdin);
      }
      const oid = (await this.#reader.readLine()).toString('ascii');
      if (!/^[0-9a-f]{40,64}$/u.test(oid)) {
        throw new Error(`git mktree returned an invalid object identifier: ${oid}`);
      }
      return oid;
    });
  }

  async close() {
    if (this.#closed) {
      return;
    }
    await this.#tail;
    this.#closed = true;
    this.#child.stdin.end();
    const [code, stderr] = await Promise.all([this.#exit, this.#stderr]);
    if (code !== 0) {
      throw new Error(`git mktree exited ${String(code)}: ${stderr.toString('utf8')}`);
    }
  }

  async #serialize(operation) {
    const current = this.#tail.then(operation);
    this.#tail = current.catch(() => {});
    return await current;
  }
}

export class FastImportWriter {
  #child;
  #closed = false;
  #exit;
  #nextMark = 1;
  #reader;
  #stderr;

  constructor(gitDir, { config = [], fastImportArguments = [], unpackLimit = null } = {}) {
    const configuration = [
      ...(unpackLimit === null ? [] : [`fastimport.unpackLimit=${unpackLimit}`]),
      ...config,
    ].flatMap((entry) => ['-c', entry]);
    this.#child = spawn(
      'git',
      [
        '--git-dir',
        gitDir,
        ...configuration,
        'fast-import',
        '--quiet',
        '--done',
        ...fastImportArguments,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    this.#reader = new ByteReader(this.#child.stdout);
    this.#stderr = collectStream(this.#child.stderr);
    this.#exit = new Promise((resolve, reject) => {
      this.#child.once('error', reject);
      this.#child.once('close', resolve);
    });
  }

  async writeBlob(content) {
    if (this.#closed) {
      throw new Error('git fast-import process is closed');
    }
    await this.#sendBlob(content);
    return await this.#readOid();
  }

  async writeAll(contents) {
    const oids = [];
    const pipelineDepth = 128;
    let pendingOids = 0;
    try {
      for await (const content of contents) {
        await this.#sendBlob(content);
        pendingOids += 1;
        if (pendingOids === pipelineDepth) {
          await this.#readOids(pendingOids, oids);
          pendingOids = 0;
        }
      }
      await this.#readOids(pendingOids, oids);
      await this.close();
      return Object.freeze(oids);
    } catch (error) {
      await this.abort();
      throw error;
    }
  }

  async #sendBlob(content) {
    const bytes = Buffer.from(content);
    const mark = this.#nextMark;
    this.#nextMark += 1;
    await this.#write(Buffer.from(`blob\nmark :${mark}\ndata ${bytes.length}\n`, 'ascii'));
    await this.#write(bytes);
    await this.#write(Buffer.from(`\nget-mark :${mark}\n`, 'ascii'));
  }

  async #readOid() {
    const oid = (await this.#reader.readLine()).toString('ascii');
    if (!/^[0-9a-f]{40,64}$/u.test(oid)) {
      throw new Error(`git fast-import returned an invalid object identifier: ${oid}`);
    }
    return oid;
  }

  async #readOids(count, target) {
    for (let index = 0; index < count; index += 1) {
      target.push(await this.#readOid());
    }
  }

  async close() {
    if (this.#closed) {
      return;
    }
    await this.#write(Buffer.from('checkpoint\ndone\n', 'ascii'));
    this.#closed = true;
    this.#child.stdin.end();
    const [code, stderr] = await Promise.all([this.#exit, this.#stderr]);
    if (code !== 0) {
      throw new Error(`git fast-import exited ${String(code)}: ${stderr.toString('utf8')}`);
    }
  }

  async abort() {
    if (!this.#closed) {
      this.#closed = true;
      this.#child.stdin.destroy();
      this.#child.kill();
    }
    await Promise.allSettled([this.#exit, this.#stderr]);
  }

  async #write(bytes) {
    if (this.#closed) {
      throw new Error('git fast-import process is closed');
    }
    if (this.#child.stdin.write(bytes)) {
      return;
    }
    await waitForDrain(this.#child.stdin);
  }
}

function parseInfoLine(line, expectedOid) {
  const fields = line.trim().split(' ');
  if (fields.length === 2 && fields[1] === 'missing') {
    throw new Error(`Git object is missing: ${expectedOid}`);
  }
  const size = Number(fields[2]);
  if (fields.length !== 3 || fields[0] !== expectedOid || !Number.isSafeInteger(size) || size < 0) {
    throw new Error(`Malformed cat-file response: ${JSON.stringify(line)}`);
  }
  return Object.freeze({ oid: fields[0], type: fields[1], size });
}

class ByteReader {
  #buffer = Buffer.alloc(0);
  #iterator;

  constructor(stream) {
    this.#iterator = stream[Symbol.asyncIterator]();
  }

  async readExactly(length) {
    await this.#fill(length);
    const result = this.#buffer.subarray(0, length);
    this.#buffer = this.#buffer.subarray(length);
    return result;
  }

  async readLine() {
    while (true) {
      const newline = this.#buffer.indexOf(0x0a);
      if (newline !== -1) {
        const result = this.#buffer.subarray(0, newline);
        this.#buffer = this.#buffer.subarray(newline + 1);
        return result;
      }
      await this.#readChunk();
    }
  }

  async #fill(length) {
    while (this.#buffer.length < length) {
      await this.#readChunk();
    }
  }

  async #readChunk() {
    const next = await this.#iterator.next();
    if (next.done) {
      throw new Error('git cat-file closed before completing its response');
    }
    const chunk = Buffer.from(next.value);
    this.#buffer = this.#buffer.length === 0 ? chunk : Buffer.concat([this.#buffer, chunk]);
  }
}

async function collectStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function collectBoundedStream(stream, maxBytes, label) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > maxBytes) {
      throw new Error(`Git ${label} exceeded ${maxBytes} bytes`);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

function waitForDrain(stream) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      stream.off('drain', onDrain);
      stream.off('error', onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    stream.once('drain', onDrain);
    stream.once('error', onError);
  });
}
