import {
  buildSubstrateVersionRef,
  buildWritersPrefix,
  REF_PREFIX,
  validateGraphName,
} from '../../src/domain/utils/RefLayout.ts';
import { textDecode } from '../../src/domain/utils/bytes.ts';
import { CURRENT_SUBSTRATE_MARKER } from '../../src/infrastructure/adapters/SubstrateVersionGate.ts';
import V18MigrationGraph from './V18MigrationGraph.ts';
import {
  listV18MigrationRefs,
  readV18MigrationRef,
  runV18MigrationGit,
  v18MigrationGitText,
} from './V18MigrationGit.ts';

const WARP_REF_PREFIX = `${REF_PREFIX}/`;
const RECOVERY_SEGMENT = '/recovery/';
const SUBSTRATE_VERSION_SUFFIX = '/substrate-version';
const WRITERS_SEGMENT = '/writers/';

/** Read-only catalog of git-warp graphs present in one Git repository. */
export default class V18MigrationGraphCatalog {
  readonly graphs: readonly V18MigrationGraph[];

  private constructor(graphs: readonly V18MigrationGraph[]) {
    this.graphs = Object.freeze([...graphs]);
    Object.freeze(this);
  }

  static async discover(repositoryPath: string): Promise<V18MigrationGraphCatalog> {
    const refs = await listV18MigrationRefs(repositoryPath, WARP_REF_PREFIX);
    const names = discoverGraphNames(refs);
    const assignments = assignRefsToGraphs(refs, names);
    const graphs: V18MigrationGraph[] = [];
    for (const name of names) {
      graphs.push(await inspectGraph(repositoryPath, name, assignments.get(name) ?? []));
    }
    return new V18MigrationGraphCatalog(graphs);
  }

  require(name: string): V18MigrationGraph {
    validateGraphName(name);
    const graph = this.graphs.find((candidate) => candidate.name === name);
    if (graph === undefined) {
      throw new Error(`Graph not found: ${name}\n${this.summary()}`);
    }
    return graph;
  }

  summary(): string {
    if (this.graphs.length === 0) {
      return 'Graphs found: none';
    }
    return ['Graphs found:', ...this.graphs.map((graph) => `  - ${graph.summary()}`)].join('\n');
  }
}

function discoverGraphNames(refs: readonly string[]): readonly string[] {
  const names = new Set<string>();
  for (const refName of refs) {
    const candidate = graphNameCandidate(refName);
    if (candidate !== null) {
      validateGraphName(candidate);
      names.add(candidate);
    }
  }
  return [...names].sort();
}

function graphNameCandidate(refName: string): string | null {
  const relative = refName.slice(WARP_REF_PREFIX.length);
  if (relative.includes(RECOVERY_SEGMENT)) {
    return null;
  }
  if (relative.endsWith(SUBSTRATE_VERSION_SUFFIX)) {
    return relative.slice(0, -SUBSTRATE_VERSION_SUFFIX.length);
  }
  const writersIndex = relative.indexOf(WRITERS_SEGMENT);
  return writersIndex <= 0 ? null : relative.slice(0, writersIndex);
}

function assignRefsToGraphs(
  refs: readonly string[],
  names: readonly string[]
): ReadonlyMap<string, readonly string[]> {
  const assignments = new Map(names.map((name) => [name, [] as string[]]));
  const longestFirst = [...names].sort((left, right) => right.length - left.length);
  for (const refName of refs) {
    if (refName.slice(WARP_REF_PREFIX.length).includes(RECOVERY_SEGMENT)) {
      continue;
    }
    const name = assignedGraphName(refName, longestFirst);
    if (name !== null) {
      assignments.get(name)?.push(refName);
    }
  }
  return assignments;
}

function assignedGraphName(refName: string, names: readonly string[]): string | null {
  const relative = refName.slice(WARP_REF_PREFIX.length);
  return names.find((name) => relative === name || relative.startsWith(`${name}/`)) ?? null;
}

async function inspectGraph(
  repositoryPath: string,
  name: string,
  refs: readonly string[]
): Promise<V18MigrationGraph> {
  const writerPrefix = buildWritersPrefix(name);
  return new V18MigrationGraph({
    name,
    refCount: refs.length,
    version: await versionLabel(repositoryPath, name),
    writerCount: refs.filter((refName) => refName.startsWith(writerPrefix)).length,
  });
}

async function versionLabel(repositoryPath: string, graph: string): Promise<string> {
  const markerOid = await readV18MigrationRef(repositoryPath, buildSubstrateVersionRef(graph));
  if (markerOid === null) {
    return 'upgrade required (legacy unmarked substrate)';
  }
  const objectType = await v18MigrationGitText(repositoryPath, ['cat-file', '-t', markerOid]);
  if (objectType !== 'blob') {
    return `unsupported marker (${objectType} ${markerOid.slice(0, 12)})`;
  }
  const marker = textDecode(
    await runV18MigrationGit(repositoryPath, ['cat-file', 'blob', markerOid])
  );
  return marker === CURRENT_SUBSTRATE_MARKER
    ? 'v19 current'
    : `unsupported marker (${sanitizeMarker(marker)})`;
}

function sanitizeMarker(marker: string): string {
  return marker.replaceAll('\n', '\\n').slice(0, 80);
}
