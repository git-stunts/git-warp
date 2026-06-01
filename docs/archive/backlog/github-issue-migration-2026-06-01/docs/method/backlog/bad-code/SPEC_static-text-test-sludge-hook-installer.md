---
id: SPEC_static-text-test-sludge-hook-installer
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/domain/services/HookInstaller.test.ts`

**Effort:** S

The `template integrity` suite reads `scripts/hooks/post-merge.sh` and
asserts literal shebang, delimiter, version-marker, and config strings.

Keep the HookInstaller behavior tests with fake file systems. Replace
template string checks with an installation smoke test that stamps the
real template and exercises classification, upgrade, append, and config
behavior through the installer.
