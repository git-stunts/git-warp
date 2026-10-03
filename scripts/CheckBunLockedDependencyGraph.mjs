import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const load = createRequire(path.join(process.cwd(), 'package.json'));
const lock = load('./package-lock.json');
if (lock.lockfileVersion !== 3 || typeof lock.packages !== 'object' || lock.packages === null) {
  throw new Error('Bun dependency check requires the reviewed npm lock v3');
}

const failures = [];
const seen = new Set();
const queue = [['', process.cwd()]];
const edges = [];
let optionalAbsent = 0;

// Validate source manifests as well as installed versions: a new workspace
// must not bypass the dependency install layer by arriving in the final COPY.
checkManifest('', process.cwd());
for (const directory of fs.readdirSync('packages', { withFileTypes: true })) {
  if (!directory.isDirectory()) { continue; }
  const key = `packages/${directory.name}`;
  if (!fs.existsSync(`${key}/package.json`)) { continue; }
  checkManifest(key, path.resolve(key));
  const manifest = load(path.resolve(key, 'package.json'));
  const installed = installedChild(process.cwd(), manifest.name);
  if (installed !== path.resolve(key)) { failures.push(`Workspace is not installed: ${key}`); }
  queue.push([key, path.resolve(key)]);
}

while (queue.length > 0) {
  const [expectedParent, actualParent] = queue.shift();
  const identity = `${expectedParent}|${actualParent}`;
  if (seen.has(identity)) { continue; }
  seen.add(identity);
  const parent = lock.packages[expectedParent];
  if (parent === undefined) { failures.push(`Workspace absent from lock: ${expectedParent}`); continue; }
  const dependencies = { ...parent.dependencies, ...parent.optionalDependencies, ...parent.peerDependencies,
    ...(expectedParent === '' ? parent.devDependencies : {}) };
  for (const name of Object.keys(dependencies)) {
    const expected = lockedChild(expectedParent, name);
    const actual = installedChild(actualParent, name);
    const optional = name in (parent.optionalDependencies ?? {}) || parent.peerDependenciesMeta?.[name]?.optional;
    if (expected === null || actual === null) {
      if (actual === null && optional) { optionalAbsent++; continue; }
      failures.push(`Dependency missing: ${expectedParent || 'root'} -> ${name}`);
      continue;
    }
    const manifest = load(path.join(actual, 'package.json'));
    edges.push(`${expectedParent}:${name}:${manifest.version}`);
    if (manifest.version !== expected.record.version) {
      failures.push(`Version drift: ${expectedParent || 'root'} -> ${name}: ${manifest.version} != ${expected.record.version}`);
    } else { queue.push([expected.key, actual]); }
  }
}

if (failures.length > 0) { throw new Error(`Bun locked dependency graph failed:\n${failures.join('\n')}`); }
const fingerprint = createHash('sha256').update(edges.sort().join('\n')).digest('hex');
console.log(`Bun locked dependency graph passed: ${edges.length} edges; ${optionalAbsent} absent optional dependencies; sha256 ${fingerprint}`);

function checkManifest(key, directory) {
  const manifest = load(path.join(directory, 'package.json'));
  const expected = lock.packages[key];
  if (expected === undefined) { failures.push(`Manifest absent from lock: ${key || 'root'}`); return; }
  if (manifest.name !== expected.name && key !== '') { failures.push(`Workspace name drift: ${key}`); }
  if (manifest.version !== expected.version) { failures.push(`Manifest version drift: ${key || 'root'}`); }
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const actualEntries = Object.entries(manifest[field] ?? {}).sort().map(([name, value]) => `${name}:${value}`);
    const expectedEntries = Object.entries(expected[field] ?? {}).sort().map(([name, value]) => `${name}:${value}`);
    if (actualEntries.join('\n') !== expectedEntries.join('\n')) { failures.push(`Manifest dependency drift: ${key || 'root'} ${field}`); }
  }
}

function lockedChild(parent, name) {
  let at = parent;
  while (true) {
    const key = `${at ? `${at}/` : ''}node_modules/${name}`;
    const record = lock.packages[key];
    if (record !== undefined) { return { key, record: record.link ? lock.packages[record.resolved] : record }; }
    if (at === '') { return null; }
    at = path.posix.dirname(at);
    if (at === '.') { at = ''; }
  }
}

function installedChild(parent, name) {
  const require = createRequire(path.join(parent, 'package.json'));
  let entry;
  try { entry = require.resolve(`${name}/package.json`); }
  catch {
    try { entry = require.resolve(name); }
    catch { return installedManifest(require, name); }
  }
  // Bun also resolves optional native shims to a built-in name, not a file.
  if (!fs.existsSync(entry)) { return installedManifest(require, name); }
  let directory = path.dirname(fs.realpathSync(entry));
  while (!fs.existsSync(path.join(directory, 'package.json'))) {
    const above = path.dirname(directory);
    if (above === directory) { return null; }
    directory = above;
  }
  return directory;
}

function installedManifest(require, name) {
  for (const root of require.resolve.paths(name) ?? []) {
    const manifest = path.join(root, name, 'package.json');
    if (fs.existsSync(manifest)) { return path.dirname(fs.realpathSync(manifest)); }
  }
  return null;
}
