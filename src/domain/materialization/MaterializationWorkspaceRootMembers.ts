export type MaterializationWorkspaceRootSet = Readonly<{
  nodeAliveRoot: string | null;
  edgeAliveRoot: string | null;
  propertiesRoot?: string | null;
  roaringIndexesRoot?: string | null;
}>;

/** Deterministic semantic members of one aggregate materialization root. */
export function materializationWorkspaceRootMembers(
  roots: MaterializationWorkspaceRootSet,
): ReadonlyArray<[path: string, handle: string]> {
  const members: Array<[string, string]> = [];
  appendRoot(members, 'roots/edge-alive', roots.edgeAliveRoot);
  appendRoot(members, 'roots/node-alive', roots.nodeAliveRoot);
  appendRoot(members, 'roots/properties', roots.propertiesRoot);
  appendRoot(members, 'roots/roaring-indexes', roots.roaringIndexesRoot);
  return Object.freeze(members);
}

function appendRoot(
  members: Array<[string, string]>,
  path: string,
  root: string | null | undefined,
): void {
  if (root !== undefined && root !== null) {
    members.push([path, root]);
  }
}
