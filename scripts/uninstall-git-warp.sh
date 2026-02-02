#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR=${GIT_WARP_HOME:-$HOME/.git-warp}
PROFILE_FILE=${GIT_WARP_PROFILE:-}
DRY_RUN=0
SILENT=0
NO_BACKUP=0

usage() {
  cat <<'USAGE'
Git Warp uninstaller

Usage: uninstall-git-warp.sh [options]

Options:
  --dry-run       show actions without performing them
  --silent        reduce logging
  --no-backup     do not create profile backups before editing
  --profile FILE  explicit profile to edit (default: auto-detect)
  -h, --help      show this help
USAGE
}

log() { [ "$SILENT" -eq 1 ] || echo "[git-warp-uninstall] $*"; }
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '+ '
    printf '%q ' "$@"
    printf '\n'
    return 0
  fi
  "$@" || return $?
}

sanitize_profile() {
  local profile="$1" install_dir="$2"
  local tmp
  tmp=$(mktemp) || return 1
  if ! awk -v dir="$install_dir" '
    {
      stripped=$0
      sub(/^[[:space:]]+/, "", stripped)
      sub(/[[:space:]]+$/, "", stripped)
      if (stripped == "# Git Warp") next
      if (index($0, dir) > 0) {
        if (stripped ~ /^export[[:space:]]+GIT_WARP_HOME=/) next
        if (stripped ~ /^export[[:space:]]+PATH=/ && index($0, dir "/bin") > 0) next
      }
      print $0
    }
  ' "$profile" > "$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  mv "$tmp" "$profile"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --silent) SILENT=1 ;;
    --no-backup) NO_BACKUP=1 ;;
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

GIT_WARP_TARGET="$INSTALL_DIR/bin/git-warp"

if [ -e "/usr/local/bin/git-warp" ]; then
  if [ -L "/usr/local/bin/git-warp" ] && [ "$(readlink "/usr/local/bin/git-warp")" = "$GIT_WARP_TARGET" ]; then
    log "Removing /usr/local/bin/git-warp"
    run rm -f /usr/local/bin/git-warp
  elif cmp -s "/usr/local/bin/git-warp" "$GIT_WARP_TARGET" 2>/dev/null; then
    log "Removing /usr/local/bin/git-warp (matching installed copy)"
    run rm -f /usr/local/bin/git-warp
  else
    log "Skipping removal of /usr/local/bin/git-warp (custom install detected)"
  fi
fi

if [ -d "$INSTALL_DIR" ]; then
  if [ -L "$INSTALL_DIR" ]; then
    log "Refusing to remove symlinked install dir $INSTALL_DIR; remove manually"
  else
    log "Removing $INSTALL_DIR"
    run rm -rf "$INSTALL_DIR"
  fi
else
  log "Install directory $INSTALL_DIR not found"
fi

if [ -n "$PROFILE_FILE" ] && [ -f "$PROFILE_FILE" ]; then
  if [ "$DRY_RUN" -eq 0 ] && [ "$NO_BACKUP" -eq 0 ]; then
    if [ ! -f "$PROFILE_FILE.git-warp.bak" ]; then
      log "Creating backup $PROFILE_FILE.git-warp.bak"
      cp "$PROFILE_FILE" "$PROFILE_FILE.git-warp.bak"
    fi
  fi
  log "Cleaning Git Warp lines from $PROFILE_FILE"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "+ removing Git Warp entries from $PROFILE_FILE"
  else
    if ! sanitize_profile "$PROFILE_FILE" "$INSTALL_DIR"; then
      log "Error: failed to clean $PROFILE_FILE; leaving original in place."
    fi
  fi
else
  log "Profile file not found or unspecified; remove PATH/GIT_WARP_HOME entries manually if needed."
fi

log "Git Warp uninstall complete"
