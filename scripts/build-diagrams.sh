#!/usr/bin/env bash
# build-diagrams.sh — Compile all .dot diagrams to SVG
#
# Usage:  ./scripts/build-diagrams.sh
#
# Requires: Graphviz (dot) installed
# Output:   docs/diagrams/fig-*.svg (transparent background, grayscale)

set -euo pipefail

DIAGRAM_DIR="docs/diagrams"
COUNT=0
ERRORS=0

if ! command -v dot &>/dev/null; then
  echo "ERROR: Graphviz (dot) is not installed. Install with: brew install graphviz" >&2
  exit 1
fi

for dotfile in "$DIAGRAM_DIR"/fig-*.dot; do
  [ -f "$dotfile" ] || continue
  svgfile="${dotfile%.dot}.svg"
  name=$(basename "$dotfile")

  printf "  %-35s → " "$name"

  if dot -Tsvg "$dotfile" -o "$svgfile" 2>/dev/null; then
    # Post-process: strip white background fills for true transparency
    # Targets the top-level polygon that Graphviz adds as a page background
    sed -i '' 's/fill="white"/fill="none"/g' "$svgfile"

    size=$(wc -c < "$svgfile" | tr -d ' ')
    size_kb=$((size / 1024))
    printf "%s (%d KB)\n" "$(basename "$svgfile")" "$size_kb"
    COUNT=$((COUNT + 1))
  else
    printf "FAILED\n" >&2
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "Built $COUNT SVGs, $ERRORS errors."

if [ "$ERRORS" -gt 0 ]; then
  exit 1
fi
