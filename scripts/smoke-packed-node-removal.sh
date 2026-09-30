#!/usr/bin/env bash
# Invoked inside the isolated consumer; all writes/reads use its installed CLI.
set -euo pipefail
ROOT=$1
PACKAGE_DIR=$2
REPO=$3
CHECK="$ROOT/scripts/package-payload/CheckPackedArtifact.ts"
mkdir -p removal-evidence
git init -q "$REPO"
git -C "$REPO" config user.name "packed lifecycle smoke"
git -C "$REPO" config user.email "packed-smoke@example.invalid"
write() {
  local writer=$1
  local request=$2
  local result="removal-evidence/$writer.json"
  npx --no-install git-warp --repo "$REPO" --lane events --writer "$writer" --json write --intent "$request" > "$result"
  node "$CHECK" derived "$result"
}
observe() {
  local reading=$1
  local expected=$2
  npx --no-install git-warp --repo "$REPO" --lane events --writer observer --json repair --action materialization > /dev/null
  npx --no-install git-warp --repo "$REPO" --lane events --writer observer --json observe --observer lifecycle --reading "$reading" > removal-evidence/reading.json
  node "$CHECK" lifecycle removal-evidence/reading.json "$expected"
}
write alice '{"kind":"entity.add","subject":"n","properties":{"color":"red"}}'
write remover '{"kind":"node.remove","subject":"n"}'
node "$CHECK" removal "$PACKAGE_DIR" "$REPO" remover alice:1
write alice '{"kind":"node.add","subject":"n"}'
observe '{"kind":"node.exists","subject":"n"}' alive
observe '{"kind":"property.get","subject":"n","key":"color"}' missing
write alice '{"kind":"property.set","subject":"n","key":"color","value":"blue"}'
observe '{"kind":"property.get","subject":"n","key":"color"}' blue

# A foreign addition remains unobserved while the two repositories are isolated.
OTHER="$REPO-replica"
git init -q "$OTHER"
git -C "$OTHER" config user.name "packed replica smoke"
git -C "$OTHER" config user.email "packed-smoke@example.invalid"
git -C "$OTHER" fetch -q "$REPO" 'refs/warp/*:refs/warp/*'
npx --no-install git-warp --repo "$OTHER" --lane events --writer bob --json write --intent '{"kind":"node.add","subject":"n"}' > removal-evidence/bob.json
node "$CHECK" derived removal-evidence/bob.json
write isolated-remover '{"kind":"node.remove","subject":"n"}'
node "$CHECK" removal "$PACKAGE_DIR" "$REPO" isolated-remover alice:2
git -C "$REPO" fetch -q "$OTHER" refs/warp/events/writers/bob:refs/warp/events/writers/bob
observe '{"kind":"node.exists","subject":"n"}' alive
observe '{"kind":"property.get","subject":"n","key":"color"}' missing
write final-remover '{"kind":"node.remove","subject":"n"}'
node "$CHECK" removal "$PACKAGE_DIR" "$REPO" final-remover bob:1
echo "packed node removal acceptance passed"
