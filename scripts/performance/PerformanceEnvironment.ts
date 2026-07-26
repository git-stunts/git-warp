import type { PerformanceResult } from './PerformanceModel.ts';

export function comparablePerformanceEnvironment(
  result: PerformanceResult,
): Omit<PerformanceResult['environment'], 'gitCas'> {
  return Object.freeze({
    architecture: result.environment.architecture,
    cpuCount: result.environment.cpuCount,
    cpuModel: result.environment.cpuModel,
    git: result.environment.git,
    node: result.environment.node,
    platform: result.environment.platform,
    runner: result.environment.runner,
  });
}
