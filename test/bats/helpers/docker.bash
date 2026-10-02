require_docker_tests() {
  node --input-type=module <<'NODE'
import { existsSync } from 'node:fs';
import { ensureDocker } from '@git-stunts/docker-guard';
ensureDocker({ env: { GIT_STUNTS_DOCKER: existsSync('/.dockerenv') ? '1' : '0' } });
NODE
}
