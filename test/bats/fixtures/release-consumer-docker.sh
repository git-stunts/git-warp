#!/usr/bin/env bash
# A controlled Docker transport inside the COPY test image; no daemon mounts.
set -euo pipefail
printf 'docker %s\n' "$*" >> "$CLOSURE_FIXTURE_DIR/commands"
IMAGE="$CLOSURE_FIXTURE_DIR/docker-image"
CONTAINER="$CLOSURE_FIXTURE_DIR/docker-container"
case "$1" in
  build)
    [ "$2" = --tag ]
    [ "$CLOSURE_FIXTURE_MODE" != image-failed ] || { echo 'controlled image failure'; exit 1; }
    [ "$CLOSURE_FIXTURE_MODE" != slow-image ] || sleep 10
    [ "$CLOSURE_FIXTURE_MODE" != slow-image-consumer ] || sleep 2
    context="$4"
    [ "$(find "$context" -mindepth 1 -maxdepth 1 -type f | wc -l)" -eq 5 ]
    for input in Dockerfile RequireDockerTests.ts consumer.sh budget.sh npm.json; do
      [ -f "$context/$input" ] && [ ! -L "$context/$input" ]
    done
    [ "$(find "$context" -mindepth 1 -maxdepth 1 | wc -l)" -eq 5 ]
    rm -rf "$IMAGE"
    mkdir "$IMAGE"
    cp "$context/"* "$IMAGE/"
    echo "$3" > "$CLOSURE_FIXTURE_DIR/image-name"
    echo 'controlled COPY image prepared' ;;
  create)
    [ "$#" -eq 11 ] && [ "$2" = --name ] && [ "$4" = --cpus ] && [ "$5" = 2 ]
    [ "$6" = --memory ] && [ "$7" = 2g ]
    [ "$8" = "$(cat "$CLOSURE_FIXTURE_DIR/image-name")" ]
    [ "$9" = @git-stunts/git-warp ] && [ "${10}" = 19.1.0 ]
    echo "$3" > "$CLOSURE_FIXTURE_DIR/container-name"
    mkdir -p "$CONTAINER/tools/release-closure" "$CONTAINER/evidence"
    cp "$IMAGE/RequireDockerTests.ts" "$CONTAINER/tools/"
    cp "$IMAGE/consumer.sh" "$IMAGE/budget.sh" "$CONTAINER/tools/release-closure/"
    cp "$IMAGE/npm.json" "$CONTAINER/evidence/"
    ln -s "$CLOSURE_FIXTURE_DEPENDENCIES" "$CONTAINER/tools/node_modules"
    printf '%s\n' "$9" "${10}" "${11}" > "$CONTAINER/arguments"
    echo "${11}" > "$CLOSURE_FIXTURE_DIR/consumer-budget"
    [ "$CLOSURE_FIXTURE_MODE" != create-failed ] || exit 1
    echo fixture-container ;;
  start)
    [ "$2" = --attach ] && [ "$3" = "$(cat "$CLOSURE_FIXTURE_DIR/container-name")" ]
    [ "$CLOSURE_FIXTURE_MODE" != canceled-consumer ] || { touch "$CLOSURE_FIXTURE_DIR/consumer-started"; sleep 30; }
    mapfile -t arguments < "$CONTAINER/arguments"
    bash "$CONTAINER/tools/release-closure/consumer.sh" "$CONTAINER/evidence" "${arguments[@]}"
    [ "$CLOSURE_FIXTURE_MODE" != missing-receipt ] || rm "$CONTAINER/evidence/consumer.json"
    [ "$CLOSURE_FIXTURE_MODE" != malformed-receipt ] || echo '{' > "$CONTAINER/evidence/consumer.json"
    if [ "$CLOSURE_FIXTURE_MODE" = symlink-receipt ]; then
      mv "$CONTAINER/evidence/consumer.json" "$CONTAINER/evidence/linked.json"
      ln -s linked.json "$CONTAINER/evidence/consumer.json"
    fi
    [ "$CLOSURE_FIXTURE_MODE" != false-receipt ] || echo '{"status":"verified"}' > "$CONTAINER/evidence/consumer.json" ;;
  stop)
    touch "$CLOSURE_FIXTURE_DIR/container-stopped" ;;
  logs)
    echo 'controlled container diagnostic' ;;
  cp)
    source="${2#*:/evidence/}"
    case "$source" in consumer.json | install.log | signatures.log | cli.log) ;; *) exit 77 ;; esac
    [ "$CLOSURE_FIXTURE_MODE" != export-failed ] || exit 1
    if [ "$CLOSURE_FIXTURE_MODE" = log-export-failed ] && [ "$source" = cli.log ]; then exit 1; fi
    cp -P "$CONTAINER/evidence/$source" "$3" ;;
  rm)
    [ "$2" = "$(cat "$CLOSURE_FIXTURE_DIR/container-name")" ]
    [ "$CLOSURE_FIXTURE_MODE" != cleanup-failed ] || exit 1
    rm -rf "$CONTAINER"
    touch "$CLOSURE_FIXTURE_DIR/container-removed" ;;
  image)
    [ "$2" = rm ] && [ "$3" = "$(cat "$CLOSURE_FIXTURE_DIR/image-name")" ]
    rm -rf "$IMAGE"
    touch "$CLOSURE_FIXTURE_DIR/image-removed" ;;
  *) exit 77 ;;
esac
