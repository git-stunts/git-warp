# Restore buffer guard for seek cache + blob adapter

git-cas 5.3.0 added `maxRestoreBufferSize` (default 512 MiB).
Neither `CasSeekCacheAdapter` nor `CasBlobAdapter` passes this
option. A tighter limit (64 MiB for blobs, 32 MiB for seek cache)
would fail fast instead of OOM.
