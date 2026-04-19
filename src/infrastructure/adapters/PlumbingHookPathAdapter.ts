import type { GitPlumbing } from './GitGraphAdapter.ts';
import HookPathPort from '../../ports/HookPathPort.ts';

type PathUtils = {
  join(...segments: string[]): string;
  resolve(...segments: string[]): string;
};

type PlumbingFactory = {
  create(repoPath: string): GitPlumbing;
};

function resolveHooksPath(customPath: string, repoPath: string, pathUtils: PathUtils): string {
  if (customPath.startsWith('/')) {
    return customPath;
  }
  return pathUtils.resolve(repoPath, customPath);
}

export default class PlumbingHookPathAdapter extends HookPathPort {
  private readonly _plumbingFactory: PlumbingFactory;
  private readonly _path: PathUtils;

  constructor({
    plumbingFactory,
    path,
  }: {
    plumbingFactory: PlumbingFactory;
    path: PathUtils;
  }) {
    super();
    this._plumbingFactory = plumbingFactory;
    this._path = path;
  }

  override async resolveHooksDir(repoPath: string): Promise<string> {
    const plumbing = this._plumbingFactory.create(repoPath);
    const customPath = await this._configGet(plumbing, 'core.hooksPath');
    if (customPath !== null && customPath.length > 0) {
      return resolveHooksPath(customPath, repoPath, this._path);
    }

    const gitDir = await this._gitDir(plumbing);
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
