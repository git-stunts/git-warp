import '../../scripts/RequireDockerTests.ts';

import process from 'node:process';

import GitProcessCounter from './GitProcessCounter.ts';
import { runScale } from './ScaleRun.ts';
import WitnessArguments from './WitnessArguments.ts';
import WitnessReport from './WitnessReport.ts';
import { WITNESS_PLAN } from './WitnessWorkload.ts';

const [repository, threadsText, traceDirectory, ...extra] = process.argv.slice(2);
if (repository === undefined || threadsText === undefined || traceDirectory === undefined || extra.length !== 0) {
  throw new TypeError('a scale worker requires repository, admitted scale, and owned trace directory');
}
const plan = WitnessArguments.parse([threadsText]);
const threads = plan?.scales[0];
if (threads === undefined) {
  throw new TypeError('the scale worker received an unadmitted scale');
}

try {
  const result = await runScale(repository, threads, new GitProcessCounter(traceDirectory), new WitnessReport(threads, process.stdout), WITNESS_PLAN);
  process.stdout.write(result.summary());
  process.exitCode = result.isComplete() ? 0 : 1;
} catch (error) {
  const detail = error instanceof Error ? error.message.slice(0, 2048) : 'unexpected non-Error failure';
  process.stdout.write(['scale-error', String(threads), encodeURIComponent(detail)].join('\t') + '\n');
  process.exitCode = 1;
}
