#!/usr/bin/env python3
"""Fresh Node-process startup pilot under one owned, bounded Docker fixture."""
from pathlib import Path
import hashlib
import os
import shutil
import statistics
import subprocess
import tempfile
import time

if not Path('/.dockerenv').exists():
    raise SystemExit('CLI startup comparisons require Docker')
ROOT = Path.cwd()
WORK = Path(tempfile.mkdtemp(prefix='cli-startup-', dir=os.environ['TMPDIR']))
SAMPLES = 20
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
    import json
    import selectors
    import signal
    for stopping in [signal.SIGINT, signal.SIGTERM]:
        repository = WORK / ('mcp-' + stopping.name)
        repository.mkdir()
        subprocess.run(['git', 'init', '-q', str(repository)], check=True)
        subprocess.run(['git', '-C', str(repository), 'config', 'user.name', 'CLI signal fixture'], check=True)
        subprocess.run(['git', '-C', str(repository), 'config', 'user.email', 'fixture@example.invalid'], check=True)
        process = subprocess.Popen(['node', str(candidate), 'mcp', '--repo', str(repository), '--writer', 'cli-signal'], cwd=consumer, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        try:
            def exchange(identifier, method, params):
                process.stdin.write(json.dumps({'jsonrpc': '2.0', 'id': identifier, 'method': method, 'params': params}) + '\n')
                process.stdin.flush()
                ready = selectors.DefaultSelector()
                ready.register(process.stdout, selectors.EVENT_READ)
                if not ready.select(20):
                    raise AssertionError('Actual MCP did not answer')
                response = json.loads(process.stdout.readline())
                ready.close()
                if response.get('id') != identifier or 'error' in response:
                    raise AssertionError('Actual MCP returned a failed readiness request')
                return response
            exchange(1, 'initialize', {'protocolVersion': '2024-11-05', 'capabilities': {}, 'clientInfo': {'name': 'launcher-fixture', 'version': '1'}})
            response = exchange(2, 'tools/call', {'name': 'warp_lane_describe', 'arguments': {'lane': 'L'}})
            if response.get('result', {}).get('isError') is True:
                raise AssertionError('Actual MCP Runtime did not open')
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
            result = subprocess.run(['node', str(path), '--help'], cwd=consumer, capture_output=True, timeout=20)
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
