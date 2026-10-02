declare module '@git-stunts/docker-guard' {
  export function ensureDocker(options: {
    readonly env: { readonly GIT_STUNTS_DOCKER: string };
  }): void;
}
