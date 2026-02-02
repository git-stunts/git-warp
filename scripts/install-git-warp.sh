#!/usr/bin/env bash
set -euo pipefail

REPO_URL=${GIT_WARP_REPO_URL:-https://github.com/git-stunts/empty-graph.git}
INSTALL_DIR=${GIT_WARP_HOME:-$HOME/.git-warp}
PROFILE_FILE=${GIT_WARP_PROFILE:-}
FORCE_CLONE=0
DRY_RUN=0
SILENT=0
SKIP_PROFILE=0

usage() {
  cat <<'USAGE'
Git Warp bootstrap installer

Usage: install-git-warp.sh [options]

Options:
  --force         overwrite existing installation directory
  --profile FILE  shell profile to update (default: auto-detect)
  --dry-run       show what would happen without making changes
  --silent        reduce logging
  --no-profile    do not modify any shell profile (print instructions instead)
  -h, --help      show this help
USAGE
}

log() { [ "$SILENT" -eq 1 ] || echo "[git-warp-install] $*"; }
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '+ '
    printf '%q ' "$@"
    printf '\n'
    return 0
  fi
  "$@" || return $?
}

resolve_path() {
  local raw="$1"
  [ -n "$raw" ] || return 1

  local path="$raw"
  case "$path" in
    ~) path="$HOME" ;;
    ~/*) path="$HOME/${path#~/}" ;;
  esac

  if [ "${path#/}" = "$path" ]; then
    path="$PWD/$path"
  fi

  local current="/"
  local suffix="${path#/}"
  local IFS='/'
  # shellcheck disable=SC2206
  local parts=( $suffix )
  local part candidate

  for part in "${parts[@]}"; do
    case "$part" in
      ''|.)
        continue
        ;;
      ..)
        current="${current%/*}"
        [ -n "$current" ] || current="/"
        continue
        ;;
    esac

    if [ "$current" = "/" ]; then
      candidate="/$part"
    else
      candidate="$current/$part"
    fi

    if [ -d "$candidate" ]; then
      current="$(cd "$candidate" 2>/dev/null && pwd -P)" || return 1
    else
      current="$candidate"
    fi
  done

  printf '%s' "$current"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE_CLONE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --silent) SILENT=1 ;;
    --no-profile) SKIP_PROFILE=1 ;;
    --profile)
      shift || { usage; exit 1; }
      PROFILE_FILE="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift || break
 done

if [ -z "$PROFILE_FILE" ]; then
  if [ -n "${ZDOTDIR:-}" ] && [ -f "$ZDOTDIR/.zshrc" ]; then
    PROFILE_FILE="$ZDOTDIR/.zshrc"
  elif [ -f "$HOME/.zshrc" ]; then
    PROFILE_FILE="$HOME/.zshrc"
  elif [ -f "$HOME/.bashrc" ]; then
    PROFILE_FILE="$HOME/.bashrc"
  elif [ -f "$HOME/.bash_profile" ]; then
    PROFILE_FILE="$HOME/.bash_profile"
  elif [ -f "$HOME/.profile" ]; then
    PROFILE_FILE="$HOME/.profile"
  fi
fi

if [ -z "$INSTALL_DIR" ]; then
  echo "Error: GIT_WARP_HOME (install directory) must not be empty" >&2
  exit 1
fi

RESOLVED_INSTALL_DIR=$(resolve_path "$INSTALL_DIR")
if [ -z "$RESOLVED_INSTALL_DIR" ]; then
  echo "Error: unable to resolve install path '$INSTALL_DIR'" >&2
  exit 1
fi

case "$RESOLVED_INSTALL_DIR" in
  /|/root|/root/*)
    echo "Error: refusing to install into $RESOLVED_INSTALL_DIR" >&2
    exit 1
    ;;
 esac

ALLOWED_BASES=${GIT_WARP_ALLOWED_BASES:-$HOME:/opt/git-warp}
IFS=':' read -r -a _git_warp_allowed <<< "$ALLOWED_BASES"
allowed_ok=0
for base in "${_git_warp_allowed[@]}"; do
  [ -z "$base" ] && continue
  resolved_base=$(resolve_path "$base" 2>/dev/null || true)
  [ -z "$resolved_base" ] && continue
  case "$RESOLVED_INSTALL_DIR" in
    "$resolved_base"|"$resolved_base"/*)
      allowed_ok=1
      break
      ;;
  esac
 done
unset _git_warp_allowed

if [ "$allowed_ok" -ne 1 ]; then
  echo "Error: install directory $RESOLVED_INSTALL_DIR is outside permitted bases ($ALLOWED_BASES)" >&2
  exit 1
fi

INSTALL_DIR="$RESOLVED_INSTALL_DIR"
log "Install dir: $INSTALL_DIR"
if [ -d "$INSTALL_DIR" ]; then
  if [ "$FORCE_CLONE" -eq 1 ]; then
    if [ -L "$INSTALL_DIR" ]; then
      echo "Error: refusing to remove symlinked install dir ($INSTALL_DIR). Remove it manually first." >&2
      exit 1
    fi
    log "Removing existing directory"
    run rm -rf "$INSTALL_DIR"
  else
    log "Directory already exists; pulling latest"
    if ! git -C "$INSTALL_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      echo "Error: $INSTALL_DIR exists but is not a git repository (use --force to replace it)" >&2
      exit 1
    fi
    default_branch=$(git -C "$INSTALL_DIR" remote show origin 2>/dev/null | awk '/HEAD branch/ {print $NF}')
    if [ -z "$default_branch" ]; then
      for candidate in main master; do
        if git -C "$INSTALL_DIR" show-ref --verify --quiet "refs/remotes/origin/$candidate"; then
          default_branch="$candidate"
          break
        fi
      done
    fi
    if [ -z "$default_branch" ]; then
      echo "Error: unable to determine origin default branch for $INSTALL_DIR" >&2
      exit 1
    fi
    run git -C "$INSTALL_DIR" fetch origin "$default_branch"
    run git -C "$INSTALL_DIR" reset --hard "origin/$default_branch"
  fi
else
  log "Cloning repo from $REPO_URL"
  run git clone "$REPO_URL" "$INSTALL_DIR"
fi

if [ "$DRY_RUN" -eq 0 ]; then
  log "Installing dependencies"
  if [ ! -f "$INSTALL_DIR/package.json" ]; then
    log "Error: package.json not found in $INSTALL_DIR"
    exit 1
  fi
  (cd "$INSTALL_DIR" && npm install ${SILENT:+--silent})
  if [ ! -f "$INSTALL_DIR/bin/git-warp" ]; then
    log "Error: expected $INSTALL_DIR/bin/git-warp to exist"
    exit 1
  fi
  if [ ! -x "$INSTALL_DIR/bin/git-warp" ]; then
    chmod +x "$INSTALL_DIR/bin/git-warp"
  fi
else
  log "Would install dependencies"
fi

BIN_LINE="export PATH=\"$INSTALL_DIR/bin:\$PATH\""
HOME_LINE="export GIT_WARP_HOME=\"$INSTALL_DIR\""
PROFILE_UPDATED=0

if [ "$SKIP_PROFILE" -eq 0 ] && [ -n "$PROFILE_FILE" ]; then
  touch "$PROFILE_FILE"
  if [ "$DRY_RUN" -eq 0 ]; then
    if [ ! -f "$PROFILE_FILE.bak" ]; then
      log "Creating backup $PROFILE_FILE.bak"
      cp "$PROFILE_FILE" "$PROFILE_FILE.bak"
    fi
    if ! grep -E "^[[:space:]]*export[[:space:]]+GIT_WARP_HOME=" "$PROFILE_FILE" >/dev/null 2>&1; then
      log "Updating $PROFILE_FILE"
      printf '\n# Git Warp\nexport GIT_WARP_HOME="%s"\nexport PATH="%s/bin:$PATH"\n' "$INSTALL_DIR" "$INSTALL_DIR" >> "$PROFILE_FILE"
      PROFILE_UPDATED=1
    else
      log "$PROFILE_FILE already references GIT_WARP_HOME; skipping"
    fi
  else
    log "Would append env vars to $PROFILE_FILE"
  fi
else
  log "No shell profile updated; export vars manually:"
  log "  $HOME_LINE"
  log "  $BIN_LINE"
fi

cat <<INFO

Git Warp installed!
Reload your shell or run:
  $HOME_LINE
  $BIN_LINE
Then test with:
  git warp --help
INFO

if [ "$PROFILE_UPDATED" -eq 1 ]; then
  echo "(Appended PATH setup to $PROFILE_FILE)"
fi
