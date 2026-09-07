#!/usr/bin/env bash
# Deterministic public-boundary fixture. Unexpected or mutating commands fail.
set -euo pipefail
tool=$(basename "$0")
printf '%s %s\n' "$tool" "$*" >> "$CLOSURE_FIXTURE_DIR/commands"
case "$tool" in
  git)
    [ "$1" = -C ] && shift 2
    case "$1" in
      rev-parse) printf '%s\n' "$CLOSURE_FIXTURE_COMMIT" ;;
      show) printf '{"name":"@git-stunts/git-warp","version":"19.1.0"}\n' ;;
      *) exit 77 ;;
    esac ;;
  gh)
    [ "$1" = api ] || exit 77
    case "$2" in
      */commits/*)
        if [ "$CLOSURE_FIXTURE_MODE" = wrong-tag ]; then echo bad; else echo "$CLOSURE_FIXTURE_COMMIT"; fi ;;
      */actions/runs/*)
        commit="$CLOSURE_FIXTURE_COMMIT"
        [ "$CLOSURE_FIXTURE_MODE" != wrong-run ] || commit=bad
        if [ "$CLOSURE_FIXTURE_MODE" = malformed-github ]; then echo '{'; exit 1; fi
        jq -n --arg commit "$commit" '{id:123,head_sha:$commit,
          path:".github/workflows/release.yml",repository:{full_name:"git-stunts/git-warp"},
          html_url:"https://github.com/git-stunts/git-warp/actions/runs/123"}' ;;
      */releases/tags/*)
        jq -n '{id:456,tag_name:"v19.1.0",draft:false,
          html_url:"https://github.com/git-stunts/git-warp/releases/tag/v19.1.0"}' ;;
      *) exit 77 ;;
    esac ;;
  npm)
    case "$1" in
      view)
        if [ "$3" = dist-tags ]; then
          if [ "$CLOSURE_FIXTURE_MODE" = advanced-tag ]; then
            echo '{"latest":"19.2.0"}'
          else echo '{"latest":"19.1.0"}'; fi
          exit
        fi
        registry=npm
        [[ "$2" != @jsr/* ]] || registry=jsr
        attempts=0
        [ ! -f "$CLOSURE_FIXTURE_DIR/$registry-attempts" ] || attempts=$(cat "$CLOSURE_FIXTURE_DIR/$registry-attempts")
        attempts=$((attempts + 1))
        echo "$attempts" > "$CLOSURE_FIXTURE_DIR/$registry-attempts"
        [ "$CLOSURE_FIXTURE_MODE" != unavailable ] || exit 1
        [ "$CLOSURE_FIXTURE_MODE" != hang ] || exec sleep 30
        if [ "$CLOSURE_FIXTURE_MODE" = delayed ] && [ "$attempts" -lt 3 ]; then exit 1; fi
        name="@git-stunts/git-warp"
        [ "$registry" != jsr ] || name="@jsr/git-stunts__git-warp"
        commit="$CLOSURE_FIXTURE_COMMIT"
        [ "$CLOSURE_FIXTURE_MODE" != wrong-npm ] || commit=bad
        integrity="$CLOSURE_FIXTURE_INTEGRITY"
        if [ "$CLOSURE_FIXTURE_MODE" = corrupt-jsr ] && [ "$registry" = jsr ]; then integrity=sha512-bad; fi
        jq -n --arg name "$name" --arg commit "$commit" --arg integrity "$integrity" \
          --arg registry "$registry" --arg mode "$CLOSURE_FIXTURE_MODE" '
          {name:$name,version:"19.1.0",gitHead:$commit,dist:{integrity:$integrity,
            tarball:(if $registry=="jsr" then "https://npm.jsr.io/fixture.tgz" else "https://registry.npmjs.org/fixture.tgz" end),
            attestations:{provenance:{predicateType:"https://slsa.dev/provenance/v1"}},signatures:[]}}|
          if $mode=="no-provenance" then del(.dist.attestations) else . end' ;;
      install)
        [ "$CLOSURE_FIXTURE_MODE" != install-failed ] || exit 1
        case "$PWD" in "$CLOSURE_FIXTURE_DIR"/*/consumer) ;; *) exit 77 ;; esac
        mkdir -p node_modules/@git-stunts/git-warp node_modules/.bin
        exports='{".":"./index.js"}'
        [ "$CLOSURE_FIXTURE_MODE" != private-leak ] || exports='{".":"./index.js","./storage":"./index.js"}'
        jq -n --argjson exports "$exports" '{name:"@git-stunts/git-warp",version:"19.1.0",type:"module",exports:$exports}' \
          > node_modules/@git-stunts/git-warp/package.json
        if [ "$CLOSURE_FIXTURE_MODE" = broken-import ]; then
          echo 'export const Wrong = true;' > node_modules/@git-stunts/git-warp/index.js
        else echo 'export class Runtime {}' > node_modules/@git-stunts/git-warp/index.js; fi
        jq -nr --arg marker "$CLOSURE_FIXTURE_DIR/executed-code" '
          "import {appendFileSync} from \"node:fs\";\nappendFileSync(\($marker|tojson), \"import\\n\");"
        ' >> node_modules/@git-stunts/git-warp/index.js
        cat > node_modules/.bin/git-warp <<'CLI'
#!/usr/bin/env bash
printf 'cli\n' >> "$CLOSURE_FIXTURE_DIR/executed-code"
[ "$CLOSURE_FIXTURE_MODE" != cli-failed ]
CLI
        chmod +x node_modules/.bin/git-warp
        integrity="$CLOSURE_FIXTURE_INTEGRITY"
        [ "$CLOSURE_FIXTURE_MODE" != corrupt-npm ] || integrity=sha512-bad
        jq -n --arg integrity "$integrity" '{packages:{
          "node_modules/@git-stunts/git-warp":{version:"19.1.0",integrity:$integrity,resolved:"https://registry.npmjs.org/fixture.tgz"},
          "node_modules/@git-stunts/git-cas":{version:"6.5.10"},
          "node_modules/@git-stunts/plumbing":{version:"3.3.0"}}}' > package-lock.json ;;
      audit)
        [ "$2" = signatures ] || exit 77
        [ "$CLOSURE_FIXTURE_MODE" != signatures-failed ] || exit 1
        echo 'registry signatures and attestations verified' ;;
      *) exit 77 ;;
    esac ;;
  curl)
    destination=""
    while [ "$#" -gt 0 ]; do
      if [ "$1" = -o ]; then destination="$2"; break; fi
      shift
    done
    printf 'fixture archive' > "$destination" ;;
  *) exit 77 ;;
esac
