import { existsSync } from 'node:fs';
import { ensureDocker } from '@git-stunts/docker-guard';

// GitHub Actions and manually exported flags are not container evidence.
ensureDocker({
  env: { GIT_STUNTS_DOCKER: existsSync('/.dockerenv') ? '1' : '0' },
});
