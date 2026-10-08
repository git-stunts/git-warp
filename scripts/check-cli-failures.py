#!/usr/bin/env python3
"""Bounded installed CLI regressions, with native entrypoint coverage; Docker only."""
from pathlib import Path
import json
import gzip
import os
import selectors
import shutil
import signal
import subprocess
import tempfile

if not Path('/.dockerenv').exists():
    raise SystemExit('CLI failure regressions require Docker')
ROOT = Path.cwd()
WORK = Path(tempfile.mkdtemp(prefix='cli-failures-', dir=os.environ['TMPDIR']))
TIMEOUT = 30
COVERAGE = WORK / 'coverage'
COVERAGE.mkdir()


def compress_coverage():
    # Retain exact report bytes compressed, avoiding accumulated import graphs.
    for path in COVERAGE.glob('*.json'):
        raw = path.read_bytes()
        path.with_suffix('.json.gz').write_bytes(gzip.compress(raw, mtime=0))
        path.unlink()


def run(arguments, environment, directory):
    process = subprocess.Popen(arguments, cwd=directory, env=environment,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, start_new_session=True)
    try:
        output, error = process.communicate(timeout=TIMEOUT)
        compress_coverage()
        return process.returncode, output, error
    finally:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=5)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


try:
    pack = WORK / 'pack'
    consumer = WORK / 'consumer'
    pack.mkdir()
    consumer.mkdir()
    subprocess.run(['node', 'scripts/package-payload/CheckPackagePayload.ts', '--pack-destination', str(pack)], check=True, timeout=60)
    subprocess.run(['npm', 'init', '-y'], cwd=consumer, stdout=subprocess.DEVNULL, check=True, timeout=TIMEOUT)
    subprocess.run(['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--fetch-retries=0', '--fetch-timeout=15000', str(next(pack.glob('*.tgz')))], cwd=consumer, stdout=subprocess.DEVNULL, check=True, timeout=60)
    package = consumer / 'node_modules/@git-stunts/git-warp'
    preload = consumer / 'inject-failures.mjs'
    registry = (package / 'dist/bin/cli/commands/registry.js').as_uri()
    infrastructure = (package / 'dist/bin/cli/infrastructure.js').as_uri()
    preload.write_text("import {CasError} from '@git-stunts/git-cas';import {COMMANDS} from " + json.dumps(registry) + ";import {CliError} from " + json.dumps(infrastructure) + ";" + r'''
COMMANDS.set('failure-fixture', async () => {
  const scenario = process.env.FAILURE_CASE;
  const batch = new CasError('Batch object count 1001 exceeds maximum 1000','PAGE_BATCH_LIMIT');
  const retention = new CasError('Workspace staged a batch but could not establish retention','WORKSPACE_RETENTION_FAILED',{originalError:batch,credential:'PRIVATE_SENTINEL'});
  if (scenario === 'retention') throw retention;
  if (scenario === 'aggregate') return {human:'START',completion:Promise.reject(new CliError('Primary command failed',{code:'E_USAGE',exitCode:1,cause:retention})),close:async()=>{throw new Error('Secondary cleanup failed');}};
  if (scenario === 'privacy') throw new Error('Safe primary',{cause:{credential:'PRIVATE_SENTINEL'}});
  if (scenario === 'accessor') {const error=new Error('Safe primary');Object.defineProperty(error,'cause',{get(){process.stdout.write('GETTER_CALLED');throw new Error('PRIVATE_ACCESSOR');}});throw error;}
  if (scenario === 'cycle') {const cause={};cause.cycle=cause;throw new Error('Safe cycle',{cause});}
  if (scenario === 'unicode') throw new Error('😀'.repeat(3000));
  if (scenario === 'credential-boundary') throw new Error('https://u:PRIVATE_PASSWORD'+'p'.repeat(2048)+'@host/path');
  if (scenario === 'aggregate-budget') throw new Error('Primary',{cause:new AggregateError(Array.from({length:7},(_,i)=>new Error('Member '+i)),'Group')});
  if (scenario === 'typed-emergency') throw new CasError('r'.repeat(1024),'WORKSPACE_RETENTION_FAILED',{originalError:new AggregateError(Array.from({length:6},()=>new Error('c'.repeat(1024))),'g'.repeat(1024))});
  if (scenario === 'signal' || scenario === 'signal-ok') {const timer=setInterval(()=>{},1000);return {human:'READY '+process.pid,payload:{readyPid:process.pid},completion:new Promise(()=>{}),close:async()=>{clearInterval(timer);if(scenario==='signal')throw new CasError('Signal cleanup failed','RESOURCE_CLOSED');}};}
  if (scenario === 'completion-failure') return {completion:Promise.reject(new CliError('Completion failed',{code:'E_USAGE',exitCode:1})),close:async()=>{}};
  if (scenario === 'cleanup-failure') return {completion:Promise.resolve(),close:async()=>{throw new Error('Cleanup alone failed');}};
  if (scenario === 'completion-ok') return {completion:Promise.resolve(),close:async()=>{}};
  if (scenario === 'long-no-completion') return {close:async()=>{}};
  if (scenario === 'lines') return {payload:{ignored:true},lines:[{line:1},{line:2}]};
  if (scenario === 'payload') return {payload:{value:1},exitCode:0};
  if (scenario === 'human') return {human:'PLAIN'};
  return {};
});
''')
    base = os.environ.copy()
    base['NODE_OPTIONS'] = '--import=' + str(preload)
    base['NODE_V8_COVERAGE'] = str(COVERAGE)
    wrapper = str(package / 'bin/git-warp')
    for scenario in ['retention', 'aggregate', 'privacy', 'accessor', 'cycle', 'unicode', 'credential-boundary', 'aggregate-budget', 'typed-emergency']:
        for mode in ['human', 'json', 'jsonl']:
            environment = base.copy()
            environment['FAILURE_CASE'] = scenario
            options = [] if mode == 'human' else ['--' + mode]
            status, output, error = run(['node', wrapper, 'failure-fixture', *options], environment, consumer)
            combined = output + error
            require(status == (1 if scenario == 'aggregate' else 3), scenario + ': wrong failure status')
            require(len(combined.encode()) <= 8192, scenario + ': output byte budget exceeded')
            require(not any(marker in combined for marker in ['PRIVATE_SENTINEL', 'GETTER_CALLED', 'PRIVATE_ACCESSOR', 'PRIVATE_PASSWORD', 'Maximum call stack size exceeded']), scenario + ': private or uncontrolled output')
            if scenario in ['retention', 'aggregate']:
                require('PAGE_BATCH_LIMIT' in combined and '1001' in combined, 'Typed nested cause missing')
            if scenario == 'aggregate':
                require('E_USAGE' in combined and 'Secondary cleanup failed' in combined, 'Primary or cleanup failure missing')
            if scenario in ['unicode', 'aggregate-budget']:
                require('omitted' in combined if mode == 'human' else json.loads(output)['error'].get('truncated') is True, 'Failure omission not disclosed')
            if scenario == 'typed-emergency':
                require('WORKSPACE_RETENTION_FAILED' in combined and 'omitted' in combined, 'Emergency typed identity or omission missing')
            print('INSTALLED_FAILURE', scenario, mode, 'PASS', flush=True)

    for signal_case, stopping in [(case, stop) for case in ['signal', 'signal-ok'] for stop in [signal.SIGINT, signal.SIGTERM]]:
        for mode in ['human', 'json', 'jsonl']:
            environment = base.copy()
            environment['FAILURE_CASE'] = signal_case
            options = [] if mode == 'human' else ['--' + mode]
            process = subprocess.Popen(['node', wrapper, 'failure-fixture', *options], cwd=consumer, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
            try:
                ready = selectors.DefaultSelector()
                ready.register(process.stdout, selectors.EVENT_READ)
                require(bool(ready.select(TIMEOUT)), 'Signal command did not become ready')
                lines = []
                if mode == 'json':
                    for index in range(4):
                        line = process.stdout.readline()
                        lines.append(line)
                        if line.strip() == '}':
                            break
                    pid = json.loads(''.join(lines))['readyPid']
                else:
                    line = process.stdout.readline()
                    pid = int(line.split()[1]) if mode == 'human' else json.loads(line)['readyPid']
                ready.close()
                os.kill(pid, stopping)
                output, error = process.communicate(timeout=TIMEOUT)
                if signal_case == 'signal':
                    require(process.returncode == 3 and 'RESOURCE_CLOSED' in output + error and 'Signal cleanup failed' in output + error, 'Signal cleanup details missing')
                else:
                    require(process.returncode == 0 and output == '' and error == '', 'Successful signal shutdown changed')
                compress_coverage()
                print('INSTALLED_SIGNAL_FAILURE', signal_case, stopping.name, mode, 'PASS', flush=True)
            finally:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=5)

    # Exercise unchanged entry paths too; coverage is native process execution.
    cases = [(['--help'], 0), ([], 1), (['--json'], 1), (['--json', '--jsonl'], 1), (['no-such-command', '--json'], 1)]
    for arguments, expected in cases:
        status, output, error = run(['node', wrapper, *arguments], base, consumer)
        require(status == expected, 'Existing early/usage exit changed')
    for scenario in ['completion-failure', 'cleanup-failure', 'completion-ok', 'long-no-completion', 'lines', 'payload', 'human', 'empty']:
        for mode in ['human', 'json', 'jsonl']:
            environment = base.copy()
            environment['FAILURE_CASE'] = scenario
            options = [] if mode == 'human' else ['--' + mode]
            status, output, error = run(['node', wrapper, 'failure-fixture', *options], environment, consumer)
            require(status == (1 if scenario == 'completion-failure' else 3 if scenario == 'cleanup-failure' else 0), 'Existing completion/output exit changed')
    reports = []
    boundaries = set()
    compress_coverage()
    selected = []
    for report in COVERAGE.glob('*.json.gz'):
        for script in json.loads(gzip.decompress(report.read_bytes()))['result']:
            if not script['url'].endswith('/dist/bin/git-warp.js'):
                continue
            selected.append(script)
            ranges = [interval for function in script['functions'] for interval in function['ranges']]
            reports.append(ranges)
            boundaries.update(offset for interval in ranges for offset in [interval['startOffset'], interval['endOffset']])
    uncovered = []
    for start, end in zip(sorted(boundaries), sorted(boundaries)[1:]):
        visits = []
        for ranges in reports:
            containing = [interval for interval in ranges if interval['startOffset'] <= start and interval['endOffset'] >= end]
            if containing:
                visits.append(min(containing, key=lambda interval: interval['endOffset'] - interval['startOffset'])['count'])
        if visits and max(visits) == 0:
            uncovered.append((start, end))
    print('NATIVE_CLI_ENTRY_SELECTED_REPORTS=' + json.dumps(selected), flush=True)
    print('NATIVE_CLI_ENTRY_UNCOVERED', uncovered, 'executions', len(reports), flush=True)
    # Diagnostics remain visible even before entry coverage is complete.
    for start, end in uncovered:
        print('UNCOVERED_ENTRY_SOURCE', repr((package / 'dist/bin/git-warp.js').read_text()[start:end]), flush=True)
    require(bool(reports) and not uncovered, 'Native CLI entry coverage is incomplete')
finally:
    shutil.rmtree(WORK)
