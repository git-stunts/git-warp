#!/usr/bin/env bash
# Exercise the installed npm command without source files or compiler configuration.
# Requires Bash >=5.2 and the COPY test image's npm, Git, jq and GNU coreutils.
# Argument: installed package directory. TMPDIR owns the disposable Git fixture
# and hash reports; the parent Docker runner bounds their lifetime and storage.
# Exit 0 means the byte/ref assertions passed; 2 means unsupported invocation.
cleanup() {
  local status=$1 work=$2
  trap - EXIT
  if ! rm --one-file-system -rf -- "$work"; then
    printf 'Could not remove owned upgrade fixture: %s\n' "$work" >&2
    if ((status == 0)); then status=1; fi
  fi
  exit "$status"
}

snapshot_package() {
  local package_dir=$1
  (cd -- "$package_dir" && find . -type f -print0 | sort -z | xargs -0 sha256sum)
}

main() {
  if ((BASH_VERSINFO[0] < 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] < 2))); then
    printf 'smoke-packed-upgrade requires Bash >=5.2; got %s\n' "$BASH_VERSION" >&2
    return 2
  fi
  set -euo pipefail
  shopt -s inherit_errexit
  shopt -u patsub_replacement
  local script_directory package_dir work
  script_directory=$(dirname -- "$0")
  # shellcheck source=SmokeTestDockerEntry.sh
  source "$script_directory/SmokeTestDockerEntry.sh"
  if [[ $# != 1 || -z $1 ]]; then
    printf 'Usage: smoke-packed-upgrade.sh <installed-package-directory>\n' >&2
    return 2
  fi
  package_dir=$(cd -- "$1" && pwd -P)
  # Ownership starts with mktemp. Cleanup gets this exact private path before
  # fixture work starts; no background workers or mounts are created.
  work=$(mktemp -d "${TMPDIR:-/tmp}/git-warp-upgrade-smoke.XXXXXX")
  trap 'cleanup "$?" "$work"' EXIT
  [[ ! -e $package_dir/tsconfig.publish.json ]]
  [[ ! -e $package_dir/index.ts ]]
  snapshot_package "$package_dir" >"$work/before.sha256"
  if ! npm --prefix "$package_dir" --silent run upgrade -- --help >"$work/help.txt" 2>&1; then
    cat "$work/help.txt" >&2
    if [[ ! -f $package_dir/dist/scripts/upgrade-v16-to-v17.js ]]; then
      printf '%s\n' 'installed npm upgrade removed its compiled entry' >&2
    fi
    exit 1
  fi
  grep -q 'npm run upgrade' "$work/help.txt"
  snapshot_package "$package_dir" >"$work/after-help.sha256"
  diff -u "$work/before.sha256" "$work/after-help.sha256"

  git init -q "$work/repo"
  git -C "$work/repo" config user.name 'Packed upgrade regression'
  git -C "$work/repo" config user.email packed-upgrade@example.invalid
  git -C "$work/repo" commit -q --allow-empty -m 'Upgrade fixture'
  git -C "$work/repo" for-each-ref >"$work/refs-before.txt"
  npm --prefix "$package_dir" --silent run upgrade -- \
    --repo "$work/repo" --dry-run --json >"$work/upgrade.json"
  jq -e '. == {dryRun: true, graphCount: 0, graphs: []}' "$work/upgrade.json" >/dev/null
  git -C "$work/repo" for-each-ref >"$work/refs-after.txt"
  diff -u "$work/refs-before.txt" "$work/refs-after.txt"
  snapshot_package "$package_dir" >"$work/after-dry-run.sha256"
  diff -u "$work/before.sha256" "$work/after-dry-run.sha256"
  printf '%s\n' 'installed npm upgrade help and dry-run preserve package bytes and repository refs'
  cleanup 0 "$work"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
