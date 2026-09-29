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

# Use npm's SemVer implementation, declared as a direct development dependency.
# Require canonical spelling; npm's tolerant leading `v` input is not a tag version.
version_order() {
  node -e '
    const semver = require("semver");
    const [left, right] = process.argv.slice(1);
    const canonical = (value) => {
      const parsed = semver.parse(value);
      return parsed !== null && value === parsed.version +
        (parsed.build.length ? "+" + parsed.build.join(".") : "");
    };
    if (!canonical(left) || !canonical(right)) {
      console.error("Refusing to compare invalid SemVer versions.");
      process.exit(1);
    }
    console.log(semver.compare(left, right));
  ' "$1" "$2"
}

version_order "$TAG_VERSION" "$TAG_VERSION" >/dev/null
prerelease="$(node -e 'const s=require("semver"); console.log(s.prerelease(process.argv[1])?.[0] ?? "")' "$TAG_VERSION")"
case "$prerelease" in
  rc)    echo "next"; exit 0 ;;
  beta)  echo "beta"; exit 0 ;;
  alpha) echo "alpha"; exit 0 ;;
  '') ;;
  *) echo "Refusing unsupported prerelease channel: $prerelease" >&2; exit 1 ;;
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

order="$(version_order "$TAG_VERSION" "$current_latest")"
if [ "$order" -ge 0 ]; then
  echo "latest"
else
  maintenance_tag="maintenance-v${TAG_VERSION%%.*}"
  if [ -n "${NPM_MAINTENANCE_PROBE_OUT+x}" ]; then
    maintenance_out="$NPM_MAINTENANCE_PROBE_OUT"
    maintenance_status="${NPM_MAINTENANCE_PROBE_STATUS:-0}"
  else
    set +e
    maintenance_out="$(npm view "$PACKAGE_NAME" "dist-tags.$maintenance_tag" 2>&1)"
    maintenance_status=$?
    set -e
  fi
  if [ "$maintenance_status" -ne 0 ]; then
    echo "Refusing to publish: could not read $maintenance_tag." >&2
    exit 1
  fi
  if [ -n "$maintenance_out" ]; then
    maintenance_order="$(version_order "$TAG_VERSION" "$maintenance_out")"
    if [ "${maintenance_out%%.*}" != "${TAG_VERSION%%.*}" ] || [ "$maintenance_order" -lt 0 ]; then
      echo "Refusing to move $maintenance_tag backward from $maintenance_out to $TAG_VERSION." >&2
      exit 1
    fi
  fi
  # Not `v16` or `16.x`: both parse as the semver range >=16.0.0 <17.0.0-0,
  # so `npm install pkg@v16` resolves as a range and shadows the dist-tag.
  echo "$maintenance_tag"
fi
