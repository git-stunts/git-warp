#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
source_history=$1
update_ratchet=$2
entry_count=$3
shift 3
[[ "$source_history" == 0 || "$source_history" == 1 ]]
[[ "$update_ratchet" == 0 || "$update_ratchet" == 1 ]]
[[ "$entry_count" =~ ^[0-9]+$ && "$entry_count" -ge 1 ]]
entries=()
for ((index=0; index<entry_count; index++)); do entries+=("$1"); shift; done
[[ "$1" == -- ]]
shift
[[ "$#" -gt 0 ]]

project="git-warp-test-$$"
container="$project-run"
compose=(docker compose --project-name "$project" --file "$ROOT/docker/docker-compose.yml")
scratch=$(mktemp -d)
created=0
orchestration_started=0
exec_pid=''
validate_path() {
  local path=$1 tracked
  case "/$path/" in
    *'/../'*|*'/./'*|*'/.git/'*|*'/node_modules/'*|*'//'*) return 1;;
  esac
  [[ -n "$path" && "$path" != . && "$path" != vitest.config.ts ]] || return 1
  tracked=$(git -C "$ROOT" ls-files -- "$path") || return 1
  [[ -z "$tracked" ]] || return 1
  while [[ "$path" != . ]]; do
    [[ ! -L "$ROOT/$path" ]] || return 1
    path=$(dirname "$path")
  done
}

export_entry() {
  local entry=$1 path=${1#*:} target="$scratch/export" links
  rm -rf "$target"
  mkdir -p "$target"
  docker cp "$container:/app/$path" "$target/payload" || return 1
  links=$(find "$target" -type l -print) || return 1
  [[ -z "$links" ]] || {
    echo 'Refusing symlink in Docker artifacts' >&2; return 1;
  }
  validate_path "$path" || return 1
  if [[ "$entry" == directory:* ]]; then
    [[ -d "$target/payload" ]] || return 1
    if [[ -d "$ROOT/$path" ]]; then
      links=$(find "$ROOT/$path" -type l -print) || return 1
      [[ -z "$links" ]] || { echo 'Refusing symlink in artifact destination' >&2; return 1; }
    fi
    mkdir -p "$ROOT/$path"
    cp -R "$target/payload/." "$ROOT/$path/"
  else
    [[ -f "$target/payload" && ! -d "$ROOT/$path" ]] || return 1
    mkdir -p "$(dirname "$ROOT/$path")"
    cp "$target/payload" "$ROOT/$path"
  fi
}
cleanup() {
  status=$?
  trap - EXIT
  trap '' INT TERM
  if [[ -n "$exec_pid" ]]; then
    kill "$exec_pid" 2>/dev/null || true
    wait "$exec_pid" 2>/dev/null || true
  fi
  if [[ "$created" == 1 ]]; then
    docker stop --time 10 "$container" >/dev/null || {
      echo 'Failed to stop Docker test container' >&2
      if [[ "$status" == 0 ]]; then status=1; fi
    }
    for entry in "${entries[@]}"; do
      [[ "$entry" == none ]] && continue
      export_entry "$entry" || {
        echo "Failed to export requested Docker artifact: ${entry#*:}" >&2
        if [[ "$status" == 0 ]]; then status=1; fi
      }
    done
    if [[ "$update_ratchet" == 1 ]]; then
      candidate="$scratch/vitest.config.ts"
      if docker cp "$container:/app/vitest.config.ts" "$candidate" && [[ "$status" == 0 ]] && \
        [[ ! -L "$candidate" && ! -L "$ROOT/vitest.config.ts" ]] && \
        cmp -s "$scratch/config-baseline.ts" "$ROOT/vitest.config.ts"; then
        cp "$candidate" "$ROOT/vitest.config.ts"
      else
        evidence="$ROOT/.ratchet/docker-results/$container"
        if validate_path ".ratchet/docker-results/$container"; then
          mkdir -p "$evidence"
          if [[ -f "$candidate" && ! -L "$candidate" && ! -L "$evidence/vitest.config.ts" ]]; then
            cp "$candidate" "$evidence/"
          fi
        fi
        echo "Coverage configuration was not applied; candidate retained in .ratchet/docker-results/$container" >&2
        if [[ "$status" == 0 ]]; then status=1; fi
      fi
    fi
    docker rm "$container" >/dev/null || {
      echo 'Failed to remove Docker test container' >&2
      if [[ "$status" == 0 ]]; then status=1; fi
    }
  fi
  if [[ "$orchestration_started" == 1 ]]; then
    "${compose[@]}" down --timeout 10 || {
      echo 'Failed to clean up Docker test project' >&2
      if [[ "$status" == 0 ]]; then status=1; fi
    }
  fi
  rm -rf "$scratch"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for entry in "${entries[@]}"; do
  [[ "$entry" == none ]] && continue
  case "$entry" in directory:*|file:*) ;; *) echo "Invalid Docker artifact kind" >&2; exit 1;; esac
  validate_path "${entry#*:}" || { echo 'Invalid or tracked Docker artifact destination' >&2; exit 1; }
done
if [[ "$update_ratchet" == 1 ]]; then
  [[ ! -L "$ROOT/vitest.config.ts" ]]
  cp "$ROOT/vitest.config.ts" "$scratch/config-baseline.ts"
fi

orchestration_started=1
"${compose[@]}" run --build --detach --no-deps --name "$container" test sleep infinity >/dev/null
created=1
if [[ "$source_history" == 1 ]]; then
  # Copy source refs only; graph-data refs and host Git configuration never enter the image.
  git -C "$ROOT" bundle create "$scratch/source.bundle" --branches --remotes --tags HEAD
  git clone --quiet --bare "$scratch/source.bundle" "$scratch/source.git"
  git --git-dir="$scratch/source.git" config --unset-all remote.origin.url
  git --git-dir="$scratch/source.git" config core.bare false
  git --git-dir="$scratch/source.git" config user.name 'Docker validation'
  git --git-dir="$scratch/source.git" config user.email docker@example.invalid
  if [[ -n "$(git -C "$ROOT" for-each-ref --format='%(refname)' refs/remotes/)" ]]; then
    git --git-dir="$scratch/source.git" fetch --quiet "$scratch/source.bundle" 'refs/remotes/*:refs/remotes/*'
  fi
  if [[ -n "$(git -C "$ROOT" for-each-ref --format='%(refname)' refs/tags/)" ]]; then
    git --git-dir="$scratch/source.git" fetch --quiet "$scratch/source.bundle" 'refs/tags/*:refs/tags/*'
  fi
  branch_ref=$(git -C "$ROOT" symbolic-ref --quiet HEAD || true)
  if [[ -n "$branch_ref" ]]; then
    git --git-dir="$scratch/source.git" symbolic-ref HEAD "$branch_ref"
  else
    git -C "$ROOT" rev-parse HEAD > "$scratch/source.git/HEAD"
  fi
  docker cp "$scratch/source.git/." "$container:/app/.git/"
fi
exec_status=0
docker exec --interactive "$container" bash scripts/run-in-docker.sh "$@" <&0 &
exec_pid=$!
wait "$exec_pid" || exec_status=$?
exit "$exec_status"
