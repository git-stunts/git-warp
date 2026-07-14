import type { GitPlumbing } from './GitTimelineHistoryAdapter.ts';
import HookPathPort from '../../ports/HookPathPort.ts';

type PathUtils = {
  join(...segments: string[]): string;
  resolve(...segments: string[]): string;
};

function resolveHooksPath(customPath: string, repoPath: string, pathUtils: PathUtils): string {
  if (customPath.startsWith('/')) {
    return customPath;
  }
  return pathUtils.resolve(repoPath, customPath);
}

export default class PlumbingHookPathAdapter extends HookPathPort {
  private readonly _plumbing: GitPlumbing;
  private readonly _path: PathUtils;

  constructor({
    plumbing,
    path,
  }: {
    plumbing: GitPlumbing;
    path: PathUtils;
  }) {
    super();
    this._plumbing = plumbing;
    this._path = path;
  }

  override async resolveHooksDir(repoPath: string): Promise<string> {
    const customPath = await this._configGet(this._plumbing, 'core.hooksPath');
    if (customPath !== null && customPath.length > 0) {
      return resolveHooksPath(customPath, repoPath, this._path);
    }

    const gitDir = await this._gitDir(this._plumbing);
    if (gitDir !== null && gitDir.length > 0) {
      return this._path.join(this._path.resolve(repoPath, gitDir), 'hooks');
    }

    return this._path.join(repoPath, '.git', 'hooks');
  }

  private async _configGet(plumbing: GitPlumbing, key: string): Promise<string | null> {
    try {
      const value = await plumbing.execute({ args: ['config', '--get', key] });
      return value.trim();
    } catch {
      return null;
    }
  }

  private async _gitDir(plumbing: GitPlumbing): Promise<string | null> {
    try {
      const value = await plumbing.execute({ args: ['rev-parse', '--git-dir'] });
      return value.trim();
    } catch {
      return null;
    }
  }
}
