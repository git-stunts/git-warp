/** The slice of the untyped plumbing package the witness counter wraps. */
declare module '@git-stunts/plumbing' {
  type CommandOptions = Readonly<{ args: readonly string[] }>;
  export default class GitPlumbing {
    executeStream(this: object, options: CommandOptions): Promise<object>;
    openSession(this: object, options: CommandOptions): Promise<object>;
  }
}
