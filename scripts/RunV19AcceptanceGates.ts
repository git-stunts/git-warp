import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  V19_CAPABILITY_CONTRACT,
} from '../bin/cli/capabilities/V19CapabilityContract.generated.ts';

type AcceptanceGate = Readonly<{
  readonly id: number;
  readonly evidence: readonly string[];
}>;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATES: readonly AcceptanceGate[] = [
  {
    id: 1,
    evidence: ['test/unit/scripts/v19-public-api-boundary.test.ts'],
  },
  {
    id: 2,
    evidence: ['test/unit/scripts/v19-public-api-boundary.test.ts'],
  },
  {
    id: 3,
    evidence: ['test/unit/domain/Lane.test.ts'],
  },
  {
    id: 4,
    evidence: [
      'test/unit/domain/IntentRuntime.test.ts',
      'test/unit/domain/ObserverRuntime.test.ts',
    ],
  },
  {
    id: 5,
    evidence: ['test/unit/domain/Observation.test.ts'],
  },
  {
    id: 6,
    evidence: ['test/unit/application/RuntimeLaneAdapter.test.ts'],
  },
  {
    id: 7,
    evidence: [
      'test/unit/domain/ObservedReading.test.ts',
      'test/unit/cli/commands/mcp.test.ts',
    ],
  },
  {
    id: 8,
    evidence: [
      'test/unit/domain/AdmissionOutcomeRuntime.test.ts',
      'test/unit/domain/ObservedReading.test.ts',
    ],
  },
  {
    id: 9,
    evidence: [
      'test/unit/application/RuntimeSettlement.preview.test.ts',
      'test/unit/domain/settlement/SettlementPlan.test.ts',
    ],
  },
  {
    id: 10,
    evidence: [
      'test/unit/scripts/v19-public-api-boundary.test.ts',
      'test/unit/domain/GraphChartObservers.test.ts',
    ],
  },
  {
    id: 11,
    evidence: [
      'test/unit/scripts/cli-command-registry.test.ts',
      'test/unit/scripts/cli-help-shape.test.ts',
      'test/unit/cli/commands/mcp.test.ts',
    ],
  },
  {
    id: 12,
    evidence: [
      'test/unit/scripts/v19-root-declaration-gate.test.ts',
      'test/unit/scripts/v19-vocabulary-contract.test.ts',
    ],
  },
];

class V19AcceptanceGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V19AcceptanceGateError';
  }
}

function requireCompleteGateMap(): void {
  const identifiers = GATES.map((gate) => gate.id);
  const expected = Array.from({ length: 12 }, (_, index) => index + 1);
  if (JSON.stringify(identifiers) !== JSON.stringify(expected)) {
    throw new V19AcceptanceGateError(
      'v19 acceptance evidence must map gates 1 through 12 exactly once',
    );
  }
  const checkpoint = readFileSync(
    resolve(ROOT, 'docs/topics/api/README.md'),
    'utf8',
  );
  for (const gate of GATES) {
    if (!checkpoint.includes(`\n${gate.id}. `)) {
      throw new V19AcceptanceGateError(
        `docs/topics/api/README.md is missing acceptance gate ${gate.id}`,
      );
    }
    if (gate.evidence.length === 0) {
      throw new V19AcceptanceGateError(
        `acceptance gate ${gate.id} has no executable evidence`,
      );
    }
  }
}

function run(command: string, args: readonly string[]): void {
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

requireCompleteGateMap();
if (V19_CAPABILITY_CONTRACT.version !== 'git-warp.capabilities/v19') {
  throw new V19AcceptanceGateError('unexpected v19 registry version');
}
run('npm', ['run', 'typecheck:consumer', '--silent']);
run(process.execPath, [
  resolve(ROOT, 'node_modules/vitest/vitest.mjs'),
  'run',
  ...new Set(GATES.flatMap((gate) => gate.evidence)),
]);
