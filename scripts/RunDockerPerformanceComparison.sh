#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
base='' head='' output='' seed=''
while [[ "$#" -gt 0 ]]; do
  [[ "$#" -ge 2 && -n "$2" ]] || { echo 'Comparison arguments require option/value pairs' >&2; exit 2; }
  case "$1" in
    --base-directory) [[ -z "$base" ]] || exit 2; base=$2;;
    --head-directory) [[ -z "$head" ]] || exit 2; head=$2;;
    --output-directory) [[ -z "$output" ]] || exit 2; output=$2;;
    --order-seed) [[ -z "$seed" ]] || exit 2; seed=$2;;
    *) echo 'Unknown comparison option' >&2; exit 2;;
  esac
  shift 2
done
[[ -n "$base" && -n "$head" && -n "$output" && "$seed" =~ ^[0-9]+$ ]] || exit 2
base=$(cd "$base" && pwd)
head=$(cd "$head" && pwd)
[[ "$base" != "$head" ]] || { echo 'Comparison requires distinct checkouts' >&2; exit 2; }
case "$output" in "$ROOT/"*) output=${output#"$ROOT/"};; esac
while [[ "$output" == ./* ]]; do output=${output#./}; done
validate_output() {
  local path=$output tracked links
  case "/$path/" in *'/../'*|*'/./'*|*/.[gG][iI][tT]/*|*/[nN][oO][dD][eE]_[mM][oO][dD][uU][lL][eE][sS]/*|*'//'*) return 1;; esac
  [[ -n "$path" && "$path" != . ]] || return 1
  tracked=$(git -C "$ROOT" ls-files -- ":(icase,literal)$path") || return 1
  [[ -z "$tracked" ]] || return 1
  while [[ "$path" != . ]]; do
    [[ ! -L "$ROOT/$path" ]] || return 1
    path=$(dirname "$path")
  done
  if [[ -e "$ROOT/$output" ]]; then
    [[ -d "$ROOT/$output" ]] || return 1
    links=$(find "$ROOT/$output" -type l -print) || return 1
    [[ -z "$links" ]] || return 1
  fi
}
validate_output || { echo 'Invalid or tracked comparison output directory' >&2; exit 2; }
scratch=$(mktemp -d)
container="git-warp-comparison-$$-${scratch##*/}"
image="git-warp-comparison:$$-${scratch##*/}"
created=0
image_built=0
attach_pid=''
export_results() {
  local links
  docker cp "$container:/comparison/performance-results" "$scratch/results" || return 1
  [[ -d "$scratch/results" && ! -L "$scratch/results" ]] || return 1
  links=$(find "$scratch/results" -type l -print) || return 1
  [[ -z "$links" ]] || return 1
  validate_output || return 1
  mkdir -p "$ROOT/$output" || return 1
  cp -R "$scratch/results/." "$ROOT/$output/"
}
cleanup() {
  status=$?
  trap - EXIT
  trap '' INT TERM
  if [[ -n "$attach_pid" ]]; then kill "$attach_pid" 2>/dev/null || true; wait "$attach_pid" 2>/dev/null || true; fi
  if [[ "$created" == 1 ]]; then
    docker stop --time 10 "$container" >/dev/null || { if [[ "$status" == 0 ]]; then status=1; fi; }
    if ! export_results; then
      echo 'Failed to export copied comparison evidence' >&2
      if [[ "$status" == 0 ]]; then status=1; fi
    fi
    docker rm "$container" >/dev/null || { if [[ "$status" == 0 ]]; then status=1; fi; }
  fi
  if [[ "$image_built" == 1 ]]; then
    docker image rm "$image" >/dev/null || {
      echo 'Failed to remove owned comparison image' >&2
      if [[ "$status" == 0 ]]; then status=1; fi
    }
  fi
  rm -rf "$scratch"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$scratch/context/docker"
copy_revision() {
  local source=$1 side=$2 dirty commit
  commit=$(git -C "$source" rev-parse HEAD) || return 1
  dirty=$(git -C "$source" status --porcelain) || return 1
  [[ -z "$dirty" ]] || { echo "Comparison $side checkout must be clean" >&2; return 1; }
  git -C "$source" bundle create "$scratch/$side.bundle" HEAD --branches --tags "$commit"
  git clone --quiet "$scratch/$side.bundle" "$scratch/context/$side"
  git -C "$scratch/context/$side" config --unset-all remote.origin.url
  git -C "$scratch/context/$side" config user.name 'Docker validation'
  git -C "$scratch/context/$side" config user.email docker@example.invalid
  git -C "$scratch/context/$side" checkout --quiet --detach "$commit"
}
copy_revision "$base" base
copy_revision "$head" head
cp "$ROOT/docker/Dockerfile.performance-comparison" "$ROOT/docker/Dockerfile.performance-comparison.dockerignore" "$scratch/context/docker/"
docker build --file "$scratch/context/docker/Dockerfile.performance-comparison" --tag "$image" "$scratch/context"
image_built=1
docker create --interactive --init --name "$container" --env "ORDER_SEED=$seed" \
  --env RUNNER_ENVIRONMENT "$image" bash -s >/dev/null
created=1
attach_status=0
docker start --attach --interactive "$container" <<'MEASUREMENT' &
set -euo pipefail
npm --prefix base run build:maintainer --silent
npm --prefix head run build:maintainer --silent
node head/dist/scripts/performance/RunPerformanceComparison.js \
  --base-directory base --head-directory head \
  --output-directory performance-results --order-seed "$ORDER_SEED"
MEASUREMENT
attach_pid=$!
wait "$attach_pid" || attach_status=$?
command_status=$(docker inspect --format '{{.State.ExitCode}}' "$container")
[[ "$command_status" =~ ^[0-9]+$ ]] || exit 1
if [[ "$command_status" != 0 ]]; then exit "$command_status"; fi
exit "$attach_status"
