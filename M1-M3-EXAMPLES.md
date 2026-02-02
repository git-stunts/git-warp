# M1–M3 Runnable Examples

These examples assume you already have a WARP-enabled Git repo with data.

## 1) Two-hop query (builder)

```js
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';
import WarpGraph, { GitGraphAdapter } from './index.js';

const runner = ShellRunnerFactory.create();
const plumbing = new GitPlumbing({ cwd: process.cwd(), runner });
const persistence = new GitGraphAdapter({ plumbing });

const graph = await WarpGraph.open({
  persistence,
  graphName: 'demo',
  writerId: 'cli',
});

const result = await graph
  .query()
  .match('user:alice')
  .outgoing('follows')
  .outgoing('follows')
  .select(['id'])
  .run();

console.log(result);
```

## 2) shortestPath traversal

```js
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';
import WarpGraph, { GitGraphAdapter } from './index.js';

const runner = ShellRunnerFactory.create();
const plumbing = new GitPlumbing({ cwd: process.cwd(), runner });
const persistence = new GitGraphAdapter({ plumbing });

const graph = await WarpGraph.open({
  persistence,
  graphName: 'demo',
  writerId: 'cli',
});

const result = await graph.traverse.shortestPath('user:alice', 'user:bob', {
  dir: 'out',
  labelFilter: 'follows',
});

console.log(result);
```

## 3) CLI query + path

```bash
warp-graph --repo . --graph demo query \
  --match user:* \
  --outgoing follows \
  --select id,props \
  --json

warp-graph --repo . --graph demo path user:alice user:bob \
  --dir out \
  --label follows \
  --json
```
