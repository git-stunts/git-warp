declare module '@git-stunts/plumbing' {
  type CollectableGitStream = AsyncIterable<Uint8Array> & {
    collect(options?: {
      readonly asString?: boolean;
      readonly maxBytes?: number;
    }): Promise<Buffer | string>;
  };

  type GitExecuteOptions = {
    readonly args: string[];
    readonly input?: string | Buffer;
  };

  export default class GitPlumbing {
    readonly emptyTree: string;

    static createDefault(options?: {
      readonly cwd?: string;
    }): Promise<GitPlumbing>;

    execute(options: GitExecuteOptions): Promise<string>;
    executeStream(options: { readonly args: string[] }): Promise<CollectableGitStream>;
  }
}
