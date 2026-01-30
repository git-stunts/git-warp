# Troubleshooting

Common issues and how to resolve them.

## 1. "fatal: Unable to create '.../index.lock': File exists"

**Symptoms:** Node creation or index building fails with a locking error.

**Cause:** Git uses lock files to ensure atomicity. If a process crashes while writing, the lock file remains.

**Solution:** 
Locate and delete the lock file in your `.git` directory:
```bash
rm .git/index.lock
# or if it was a ref update
rm .git/refs/heads/main.lock
```

## 2. Low Performance during Traversal

**Symptoms:** `getChildren()` or `getParents()` is taking seconds instead of milliseconds.

**Cause:** 
1.  **Missing Index:** You are likely not using the Bitmap Index and are falling back to raw Git scans.
2.  **Native Bindings:** You are using the Javascript fallback for Roaring Bitmaps instead of the native C++ bindings.

**Solution:**
1.  Ensure you have built and loaded the index: `await graph.loadIndex(oid)`.
2.  Install the native bindings:
    ```bash
    npm install roaring
    ```
    EmptyGraph will automatically detect and use the native version if available.

## 3. Data Missing after `git gc`

**Symptoms:** Previously created nodes are no longer retrievable.

**Cause:** You created nodes but did not anchor them to a Git Reference. Git's Garbage Collector deleted them as "unreachable."

**Solution:** Always call `plumbing.updateRef()` after creating a node to ensure it is part of a reachable history. See the [Operations Guide](./operations) for details.

## 4. "Invalid Ref Format" Errors

**Symptoms:** `listNodes` or `iterateNodes` throws a validation error.

**Cause:** EmptyGraph enforces strict security patterns on Git refs to prevent command injection.

**Solution:** 
- Avoid starting ref names with `-` or `--`.
- Use only alphanumeric characters, `.`, `/`, `-`, `_`, `^`, `~`.
- Ensure the ref length is under 1024 characters.
