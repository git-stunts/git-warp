#!/bin/sh
# Decides which npm dist-tag a release tag may claim.
#
# `latest` is what a bare `npm install` resolves to, so a stable tag does not
# claim it by virtue of being stable — only a version at or above the one the
# registry currently serves may. Without this, a maintenance release of an
# older major moves every new install backwards, silently and irreversibly.
#
# Usage: compute-npm-dist-tag.sh <tag-version>
# Prints the dist-tag on stdout. Exits non-zero, printing nothing, when the
# decision cannot be made safely.
#
# Tests inject the registry answer with NPM_DIST_TAG_PROBE_OUT and
# NPM_DIST_TAG_PROBE_STATUS instead of reaching the network.
set -eu

PACKAGE_NAME="@git-stunts/git-warp"
TAG_VERSION="${1:-}"

if [ -z "$TAG_VERSION" ]; then
  echo "usage: compute-npm-dist-tag.sh <tag-version>" >&2
  exit 2
fi

case "$TAG_VERSION" in
  *-rc.*)    echo "next";  exit 0 ;;
  *-beta.*)  echo "beta";  exit 0 ;;
  *-alpha.*) echo "alpha"; exit 0 ;;
esac

if [ -n "${NPM_DIST_TAG_PROBE_OUT+x}" ]; then
  probe_out="$NPM_DIST_TAG_PROBE_OUT"
  probe_status="${NPM_DIST_TAG_PROBE_STATUS:-0}"
else
  set +e
  probe_out="$(npm view "$PACKAGE_NAME" version 2>&1)"
  probe_status=$?
  set -e
fi

if [ "$probe_status" -ne 0 ]; then
  # Nothing published yet means nothing to demote.
  if printf '%s' "$probe_out" | grep -q 'E404'; then
    echo "latest"
    exit 0
  fi
  # Fail closed. Defaulting to `latest` mispublishes a back-release;
  # defaulting to a maintenance tag silently fails to promote a real one.
  # Neither is recoverable once published, and a failed release is cheap.
  echo "Could not read the published latest version of $PACKAGE_NAME:" >&2
  printf '%s\n' "$probe_out" >&2
  echo "Refusing to choose a dist-tag without knowing what 'latest' currently is." >&2
  exit 1
fi

current_latest="$probe_out"

# A successful probe that yields no version is not an answer. Treating an
# empty string as the published latest makes every tag sort above it, so
# every release would claim `latest` — the exact failure this guards.
if ! printf '%s' "$current_latest" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+'; then
  echo "Registry returned no usable version for $PACKAGE_NAME: '$current_latest'" >&2
  echo "Refusing to choose a dist-tag without knowing what 'latest' currently is." >&2
  exit 1
fi

highest="$(printf '%s\n%s\n' "$TAG_VERSION" "$current_latest" | sort -V | tail -1)"

if [ "$highest" = "$TAG_VERSION" ]; then
  echo "latest"
else
  # Not `v16` or `16.x`: both parse as the semver range >=16.0.0 <17.0.0-0,
  # so `npm install pkg@v16` resolves as a range and shadows the dist-tag.
  echo "maintenance-v${TAG_VERSION%%.*}"
fi
