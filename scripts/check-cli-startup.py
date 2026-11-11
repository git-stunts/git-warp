#!/usr/bin/env python3
"""Fresh Node-process startup pilot under one owned, bounded Docker fixture."""
import hashlib
import json
import os
import selectors
import shutil
import signal
import statistics
import subprocess
import tempfile
import time
from pathlib import Path

if not Path('/.dockerenv').exists():
    raise SystemExit('CLI startup comparisons require Docker')
ROOT = Path.cwd()
WORK = Path(tempfile.mkdtemp(prefix='cli-startup-', dir=os.environ['TMPDIR']))
SAMPLES = 20
READINESS_LANE = 'L'
READINESS_TOOLS = frozenset(['warp_observation_start', 'warp_observation_cancel'])


class ReadinessRefused(RuntimeError):
    """The actual MCP did not open Runtime; this is a setup failure, not a startup measurement."""


def exchange(process, identifier, method, params):
    process.stdin.write(json.dumps({'jsonrpc': '2.0', 'id': identifier, 'method': method, 'params': params}) + '\n')
    process.stdin.flush()
    ready = selectors.DefaultSelector()
    ready.register(process.stdout, selectors.EVENT_READ)
    try:
        if not ready.select(20):
            raise ReadinessRefused('Actual MCP did not answer ' + method)
        response = json.loads(process.stdout.readline())
    finally:
        ready.close()
    if response.get('id') != identifier or 'error' in response:
        raise ReadinessRefused('Actual MCP refused readiness request ' + method + ': ' + json.dumps(response.get('error')))
    return response


def open_runtime(process):
    """Open Runtime and one lane through tools that the current MCP registry keeps, then release the observation."""
    exchange(process, 1, 'initialize', {'protocolVersion': '2024-11-05', 'capabilities': {}, 'clientInfo': {'name': 'launcher-fixture', 'version': '1'}})
    listed = exchange(process, 2, 'tools/list', {})
    names = {tool.get('name') for tool in listed.get('result', {}).get('tools', [])}
    missing = sorted(READINESS_TOOLS - names)
    if missing:
        raise ReadinessRefused('Actual MCP registry does not list readiness tools: ' + ', '.join(missing))
    started = exchange(process, 3, 'tools/call', {'name': 'warp_observation_start', 'arguments': {'lane': READINESS_LANE, 'observerId': 'startup-readiness', 'reading': {'kind': 'entity-admissions'}}})
    observation = started.get('result', {}).get('structuredContent', {})
    identifier = observation.get('observationId')
    if not isinstance(identifier, str) or observation.get('terminal') is not False:
        raise ReadinessRefused('Actual MCP Runtime did not open an observation')
    canceled = exchange(process, 4, 'tools/call', {'name': 'warp_observation_cancel', 'arguments': {'observationId': identifier}})
    if canceled.get('result', {}).get('structuredContent') != {'observationId': identifier, 'canceled': True}:
        raise ReadinessRefused('Actual MCP did not release the readiness observation')
    print('ACTUAL_MCP_RUNTIME_READY', 'lane', READINESS_LANE, flush=True)


try:
    pack = WORK / 'pack'
    consumer = WORK / 'consumer'
    pack.mkdir()
    consumer.mkdir()
    subprocess.run(['node', 'scripts/package-payload/CheckPackagePayload.ts', '--pack-destination', str(pack)], check=True)
    subprocess.run(['npm', 'init', '-y'], cwd=consumer, stdout=subprocess.DEVNULL, check=True)
    subprocess.run(['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--fetch-retries=0', '--fetch-timeout=15000', str(next(pack.glob('*.tgz')))], cwd=consumer, stdout=subprocess.DEVNULL, check=True)
    package = consumer / 'node_modules/@git-stunts/git-warp'
    baseline = package / 'bin/baseline-launcher'
    baseline.write_bytes((ROOT / 'test/evidence/984-cli-launcher/baseline-wrapper.txt').read_bytes())
    candidate = package / 'bin/git-warp'
    # Exercise the actual long-running CLI, not only a controlled signal entry.
    for stopping in [signal.SIGINT, signal.SIGTERM]:
        repository = WORK / ('mcp-' + stopping.name)
        repository.mkdir()
        subprocess.run(['git', 'init', '-q', str(repository)], check=True)
        subprocess.run(['git', '-C', str(repository), 'config', 'user.name', 'CLI signal fixture'], check=True)
        subprocess.run(['git', '-C', str(repository), 'config', 'user.email', 'fixture@example.invalid'], check=True)
        process = subprocess.Popen(['node', str(candidate), 'mcp', '--repo', str(repository), '--writer', 'cli-signal'], cwd=consumer, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        try:
            open_runtime(process)
            os.kill(process.pid, stopping)
            output, error = process.communicate(timeout=20)
            if process.returncode != 0 or error:
                raise AssertionError('Actual MCP did not close gracefully under ' + stopping.name + ': ' + error)
            print('ACTUAL_MCP_SIGNAL_CLEAN_EXIT', stopping.name, flush=True)
        finally:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=5)

    measured = {'baseline': [], 'candidate': []}
    for index in range(SAMPLES):
        order = ['baseline', 'candidate'] if index % 2 == 0 else ['candidate', 'baseline']
        for name in order:
            path = baseline if name == 'baseline' else candidate
            started = time.perf_counter_ns()
            result = subprocess.run(['node', str(path), '--help'], cwd=consumer, capture_output=True, timeout=20, check=False)
            elapsed = (time.perf_counter_ns() - started) / 1_000_000
            if result.returncode != 0 or result.stderr:
                raise AssertionError('Help comparison failed: ' + name)
            measured[name].append(elapsed)
    for name, samples in measured.items():
        ordered = sorted(samples)
        print('FRESH_PROCESS_STARTUP', name, 'samples', len(samples), 'p50_ms', statistics.median(samples), 'p95_ms', ordered[18], 'p99_ms', ordered[19], 'raw_ms', samples, flush=True)
    print('STARTUP_BASELINE_WRAPPER_SHA256', hashlib.sha256(baseline.read_bytes()).hexdigest(), flush=True)
    print('STARTUP_COMPARISON_SCOPE fresh-process cold Node startup; filesystem/dependency cache shared, not a cold-disk or universal latency claim', flush=True)
finally:
    shutil.rmtree(WORK)
