import WarpError from '../../domain/errors/WarpError.ts';

export function requireWorkspaceOptions(options: unknown): void {
  requireObject(options, 'options');
  const workspace: unknown = Reflect.get(options, 'workspace');
  requireObject(workspace, 'git-cas workspace dependency');
  const pages: unknown = Reflect.get(workspace, 'pages');
  const bundles: unknown = Reflect.get(workspace, 'bundles');
  requireObject(pages, 'git-cas workspace dependency pages');
  requireObject(bundles, 'git-cas workspace dependency bundles');
  requireMethod(pages, 'put', 'git-cas workspace pages');
  requireMethod(pages, 'putBatch', 'git-cas workspace pages');
  requireMethod(bundles, 'putOrdered', 'git-cas workspace bundles');
  requireMethod(bundles, 'putOrderedBatch', 'git-cas workspace bundles');
  requireMethod(workspace, 'batch', 'git-cas workspace');
  requireMethod(workspace, 'checkpoint', 'git-cas workspace');
  requireMethod(workspace, 'promoteToCache', 'git-cas workspace');
  requireMethod(workspace, 'release', 'git-cas workspace');
  requireFunction(Reflect.get(options, 'promote'), 'promote dependency');
}

function requireObject(value: unknown, field: string): asserts value is object {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw workspaceError(`${field} is required`);
  }
}

function requireMethod(value: object, method: string, field: string): void {
  if (typeof Reflect.get(value, method) !== 'function') {
    throw workspaceError(`${field} must provide ${method}()`);
  }
}

function requireFunction(value: unknown, field: string): void {
  if (typeof value !== 'function') {
    throw workspaceError(`${field} is required`);
  }
}

function workspaceError(message: string): WarpError {
  return new WarpError(
    `Materialization workspace ${message}`,
    'E_MATERIALIZATION_STORAGE',
  );
}
