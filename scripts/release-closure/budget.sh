#!/usr/bin/env bash
# Shared elapsed-time budget for the registry driver and independent consumer.

start_budget() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]] && [ "$1" -le 720 ] || return 2
  [[ "$2" =~ ^[1-9][0-9]*$ ]] && [ "$2" -le 180 ] || return 2
  CLOSURE_DEADLINE=$((SECONDS + $1))
  CLOSURE_COMMAND_LIMIT="$2"
}

budget_remaining() {
  local remaining=$((CLOSURE_DEADLINE - SECONDS))
  if [ "$remaining" -le 0 ]; then
    echo 'release closure aggregate time budget exhausted' >&2
    return 124
  fi
  printf '%s\n' "$remaining"
}

bounded() {
  local limit
  limit=$(budget_remaining) || return $?
  if [ "$limit" -gt "$CLOSURE_COMMAND_LIMIT" ]; then limit="$CLOSURE_COMMAND_LIMIT"; fi
  timeout --kill-after=5s "${limit}s" "$@"
}
