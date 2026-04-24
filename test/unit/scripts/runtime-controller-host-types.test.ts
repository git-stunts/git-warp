import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strandControllerSource = readFileSync(
  join(process.cwd(), 'src/domain/services/controllers/StrandController.ts'),
  'utf8',
);
const conflictAnalyzerSource = readFileSync(
  join(process.cwd(), 'src/domain/services/strand/ConflictAnalyzerService.ts'),
  'utf8',
);
const checkpointControllerSource = readFileSync(
  join(process.cwd(), 'src/domain/services/controllers/CheckpointController.ts'),
  'utf8',
);
const patchControllerSource = readFileSync(
  join(process.cwd(), 'src/domain/services/controllers/PatchController.ts'),
  'utf8',
);
const syncControllerTypesSource = readFileSync(
  join(process.cwd(), 'src/domain/services/controllers/SyncControllerTypes.ts'),
  'utf8',
);
const forkControllerSource = readFileSync(
  join(process.cwd(), 'src/domain/services/controllers/ForkController.ts'),
  'utf8',
);

describe('runtime controller host types', () => {
  it('keeps controller and strand seams off direct WarpRuntime imports', () => {
    expect(strandControllerSource).not.toContain('import type WarpRuntime');
    expect(conflictAnalyzerSource).not.toContain('import type WarpRuntime');
    expect(checkpointControllerSource).not.toContain('import type WarpRuntime');
    expect(patchControllerSource).not.toContain('import type WarpRuntime');
    expect(syncControllerTypesSource).not.toContain('import type WarpRuntime');
    expect(forkControllerSource).not.toContain('import type WarpRuntime');
  });

  it('does not derive host fields through WarpRuntime indexed access', () => {
    expect(checkpointControllerSource).not.toContain("WarpRuntime['");
    expect(patchControllerSource).not.toContain("WarpRuntime['");
    expect(syncControllerTypesSource).not.toContain("WarpRuntime['");
  });

  it('reopens forks through the runtime boot function instead of the class surface', () => {
    expect(forkControllerSource).not.toContain('WarpRuntime.open(');
    expect(forkControllerSource).not.toContain('{ default: WarpRuntime }');
    expect(forkControllerSource).toContain('runtimeModule.openWarpRuntime({');
  });

  it('constructs the strand coordinator without host adapter casts', () => {
    expect(strandControllerSource).not.toContain('as unknown as');
    expect(strandControllerSource).toContain('createStrandCoordinator(host)');
  });
});
