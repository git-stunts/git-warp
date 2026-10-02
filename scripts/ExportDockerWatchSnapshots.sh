#!/usr/bin/env bash
set -euo pipefail

operation=$1
root=$2
scratch=$3
project=$4
baseline="$scratch/baseline"
candidate="$scratch/candidate"

reject_links() {
  local path=$1 links
  [[ -d "$path" && ! -L "$path" ]] || return 1
  links=$(find "$path" -type l -print) || return 1
  [[ -z "$links" ]] || { echo 'Refusing symlink in watch snapshot tree' >&2; return 1; }
}

if [[ "$operation" == capture ]]; then
  reject_links "$root/test"
  cp -R "$root/test" "$baseline"
  exit
fi
[[ "$operation" == apply ]] || exit 2
[[ "$project" =~ ^git-warp-watch-[0-9]+$ ]] || exit 2
reject_links "$baseline"
reject_links "$candidate"
reject_links "$root/test"

evidence="$root/.ratchet/docker-results/$project"
retained=0
status=0
retain() {
  local path=$1 parent relative=${1#test/}
  if [[ "$retained" == 0 ]]; then
    parent="$evidence"
    while [[ "$parent" != "$root" ]]; do
      [[ ! -L "$parent" ]] || return 1
      parent=$(dirname "$parent")
    done
    mkdir -p "$(dirname "$evidence")"
    mkdir "$evidence" || return 1
    mkdir "$evidence/watch-snapshots"
    retained=1
  fi
  mkdir -p "$evidence/watch-snapshots/$(dirname "$relative")"
  if [[ -f "$candidate/$relative" ]]; then
    cp "$candidate/$relative" "$evidence/watch-snapshots/$relative"
  else
    printf '%s\n' 'Snapshot deletion conflicts with a host edit.' > "$evidence/watch-snapshots/$relative.deleted"
  fi
  echo "Watch snapshot conflict: $path; candidate retained in .ratchet/docker-results/$project/watch-snapshots" >&2
  status=1
}

# Build a NUL-delimited inventory before writing, so failed traversal cannot
# silently certify a partial export. Only snapshot files and existing test
# modules (Vitest inline snapshots) may cross back into the checkout.
find "$candidate" "$baseline" -type f -print0 > "$scratch/snapshot-files"
while IFS= read -r -d '' file; do
  if [[ "$file" == "$candidate/"* ]]; then relative=${file#"$candidate/"};
  else relative=${file#"$baseline/"}; fi
  path="test/$relative"
  snapshot=0
  case "$path" in */__snapshots__/*.snap) snapshot=1;; esac
  if [[ "$snapshot" == 0 ]]; then
    [[ "$path" =~ \.(test|spec)\.[cm]?[jt]sx?$ && -f "$baseline/$relative" && -f "$candidate/$relative" ]] || continue
  fi
  original="$baseline/$relative"
  updated="$candidate/$relative"
  host="$root/$path"
  if [[ ! -e "$updated" && ! -e "$host" ]]; then continue; fi
  # Host edits synchronized into the container already agree; they need no export.
  if [[ -f "$updated" && -f "$host" ]] && cmp -s "$updated" "$host"; then continue; fi
  if [[ -f "$updated" && -f "$original" ]] && cmp -s "$updated" "$original"; then continue; fi
  if [[ ! -e "$updated" && ! -e "$original" ]]; then continue; fi
  if [[ -f "$original" ]]; then
    if [[ ! -f "$host" ]] || ! cmp -s "$original" "$host"; then retain "$path"; continue; fi
  elif [[ -e "$host" ]]; then
    retain "$path"; continue
  fi
  if [[ -f "$updated" ]]; then
    mkdir -p "$(dirname "$host")"
    cp "$updated" "$host"
  elif [[ "$snapshot" == 1 && -f "$host" ]]; then
    rm "$host"
  fi
done < "$scratch/snapshot-files"
exit "$status"
