#!/usr/bin/env bats

load helpers/setup.bash

# Size: medium. These tests use local Git and bounded CLI subprocesses, never the network.
# Oracles: the public Receipt envelope plus the exact-frontier Settlement contract in
# docs/migrations/v19/README.md and docs/topics/strands.md.
# The application property names and canonical bytes are opaque consumer fixtures;
# Git WARP must preserve them without acquiring their semantic vocabulary.

setup() {
  setup_test_repo
}

teardown() {
  teardown_test_repo
}

@test "direct worldline admission retains application and substrate identities across restart" {
  event_bytes="7b22636c6f7365526561736f6e223a22636f6d706c65746564222c226576656e74496e74656e744964223a22696e74656e743a6469726563742d636c6f7365222c22736368656d61223a226578616d706c652f776f726b73706163652d73657373696f6e2d6576656e742f7631222c22776f726b737061636553657373696f6e4964223a22776f726b73706163652d73657373696f6e3a646972656374227d"

  run "${CLI[@]}" write \
    --lane events \
    --writer leased-agent \
    --json \
    --intent "{\"kind\":\"entity.add\",\"namespace\":\"workspace-session-event\",\"properties\":{\"eventIntentId\":\"intent:direct-close\",\"workspaceSessionId\":\"workspace-session:direct\",\"eventBytesHex\":\"${event_bytes}\",\"closeReason\":\"completed\"}}"
  assert_success
  write_receipt="$output"
  event_subject="$(JSON="$write_receipt" python3 -c 'import json, os; print(json.loads(os.environ["JSON"])["occurrence"]["subject"])')"

  run "${CLI[@]}" repair \
    --lane events \
    --writer reader \
    --json \
    --action materialization
  assert_success

  run "${CLI[@]}" observe \
    --lane events \
    --writer reader \
    --json \
    --observer session-event.bytes \
    --reading "{\"kind\":\"property.get\",\"subject\":\"${event_subject}\",\"key\":\"eventBytesHex\"}"
  assert_success
  observation="$output"

  WRITE_RECEIPT="$write_receipt" OBSERVATION="$observation" EVENT_BYTES="$event_bytes" python3 - <<'PY'
import json
import os

receipt = json.loads(os.environ["WRITE_RECEIPT"])
observation = json.loads(os.environ["OBSERVATION"])
properties = receipt["intent"]["properties"]
occurrence = receipt["occurrence"]

def require(condition, contract):
    if not condition:
        raise AssertionError(contract)

def require_equal(actual, expected, contract):
    if actual != expected:
        raise AssertionError(f"{contract}: expected {expected!r}, got {actual!r}")

require_equal(receipt["intent"]["namespace"], "workspace-session-event", "write receipt preserves the application namespace")
require_equal(properties, {
    "eventIntentId": "intent:direct-close",
    "workspaceSessionId": "workspace-session:direct",
    "eventBytesHex": os.environ["EVENT_BYTES"],
    "closeReason": "completed",
}, "write receipt preserves the application event envelope")
require_equal(json.loads(bytes.fromhex(os.environ["EVENT_BYTES"])), {
    "closeReason": "completed",
    "eventIntentId": "intent:direct-close",
    "schema": "example/workspace-session-event/v1",
    "workspaceSessionId": "workspace-session:direct",
}, "canonical bytes carry the complete direct event")
require(occurrence["id"].startswith("occurrence:"), "receipt carries substrate occurrence identity")
require(occurrence["subject"].startswith("workspace-session-event:"), "receipt carries graph subject identity")
require(occurrence["id"] not in properties.values(), "occurrence identity remains distinct from application identities")
require(occurrence["subject"] not in properties.values(), "graph subject remains distinct from application identities")
require_equal(observation["readings"][0]["value"], os.environ["EVENT_BYTES"], "subject recovers exact event bytes after restart")
require_equal(observation["receipt"]["status"], "completed", "event read completes under a bounded observation")
basis_id = observation["readings"][0]["coordinate"]["basis"]["id"]
require(isinstance(basis_id, str) and len(basis_id) > 0, "event read carries a non-empty basis handle")
PY
}

@test "candidate strands retain entity identity and enforce exact-frontier settlement" {
  completed_bytes="7b22636c6f7365526561736f6e223a22636f6d706c65746564222c226576656e74496e74656e744964223a22696e74656e743a63616e6469646174652d612d636c6f7365222c22736368656d61223a226578616d706c652f776f726b73706163652d73657373696f6e2d6576656e742f7631222c22776f726b737061636553657373696f6e4964223a22776f726b73706163652d73657373696f6e3a736861726564227d"
  crashed_bytes="7b22636c6f7365526561736f6e223a2263726173686564222c226576656e74496e74656e744964223a22696e74656e743a63616e6469646174652d622d636c6f7365222c22736368656d61223a226578616d706c652f776f726b73706163652d73657373696f6e2d6576656e742f7631222c22776f726b737061636553657373696f6e4964223a22776f726b73706163652d73657373696f6e3a736861726564227d"

  run "${CLI[@]}" write \
    --lane events \
    --writer coordinator \
    --json \
    --intent '{"kind":"node.add","subject":"workcell:basis"}'
  assert_success

  run "${CLI[@]}" fork \
    --lane events \
    --writer coordinator \
    --json \
    --name candidate-a
  assert_success

  run "${CLI[@]}" fork \
    --lane events \
    --writer coordinator \
    --json \
    --name candidate-b
  assert_success

  run "${CLI[@]}" write \
    --lane events \
    --strand candidate-a \
    --writer writer-a \
    --json \
    --intent "{\"kind\":\"entity.add\",\"namespace\":\"workspace-session-event\",\"properties\":{\"eventIntentId\":\"intent:candidate-a-close\",\"workspaceSessionId\":\"workspace-session:shared\",\"eventBytesHex\":\"${completed_bytes}\",\"closeReason\":\"completed\"}}"
  assert_success
  candidate_a_receipt="$output"
  candidate_a_subject="$(JSON="$candidate_a_receipt" python3 -c 'import json, os; print(json.loads(os.environ["JSON"])["occurrence"]["subject"])')"

  run "${CLI[@]}" write \
    --lane events \
    --strand candidate-b \
    --writer writer-b \
    --json \
    --intent "{\"kind\":\"entity.add\",\"namespace\":\"workspace-session-event\",\"properties\":{\"eventIntentId\":\"intent:candidate-b-close\",\"workspaceSessionId\":\"workspace-session:shared\",\"eventBytesHex\":\"${crashed_bytes}\",\"closeReason\":\"crashed\"}}"
  assert_success
  candidate_b_receipt="$output"
  candidate_b_subject="$(JSON="$candidate_b_receipt" python3 -c 'import json, os; print(json.loads(os.environ["JSON"])["occurrence"]["subject"])')"

  plan_file="${BATS_TEST_TMPDIR}/candidate-a-settlement.json"
  run "${CLI[@]}" settle preview \
    --writer settler \
    --json \
    --source events \
    --strand candidate-a \
    --target events \
    --out "$plan_file"
  assert_success
  candidate_a_preview="$output"

  run "${CLI[@]}" settle apply \
    --writer settler \
    --json \
    --plan "$plan_file"
  assert_success
  candidate_a_settlement="$output"

  run "${CLI[@]}" settle preview \
    --writer settler \
    --json \
    --source events \
    --strand candidate-b \
    --target events
  assert_success
  candidate_b_preview="$output"

  run "${CLI[@]}" repair \
    --lane events \
    --writer reader \
    --json \
    --action materialization
  assert_success

  run "${CLI[@]}" observe \
    --lane events \
    --writer reader \
    --json \
    --observer session-event.candidate-a-parent-bytes \
    --reading "{\"kind\":\"property.get\",\"subject\":\"${candidate_a_subject}\",\"key\":\"eventBytesHex\"}"
  assert_success
  candidate_a_parent_observation="$output"

  run "${CLI[@]}" observe \
    --lane events \
    --writer reader \
    --json \
    --observer session-event.candidate-b-parent-exists \
    --reading "{\"kind\":\"node.exists\",\"subject\":\"${candidate_b_subject}\"}"
  assert_success
  candidate_b_parent_observation="$output"

  run "${CLI[@]}" observe \
    --lane events \
    --strand candidate-b \
    --writer reader \
    --json \
    --observer session-event.candidate-b-strand-bytes \
    --reading "{\"kind\":\"property.get\",\"subject\":\"${candidate_b_subject}\",\"key\":\"eventBytesHex\"}"
  assert_success
  candidate_b_strand_observation="$output"

  CANDIDATE_A_RECEIPT="$candidate_a_receipt" \
  CANDIDATE_B_RECEIPT="$candidate_b_receipt" \
  CANDIDATE_A_PREVIEW="$candidate_a_preview" \
  CANDIDATE_A_SETTLEMENT="$candidate_a_settlement" \
  CANDIDATE_B_PREVIEW="$candidate_b_preview" \
  CANDIDATE_A_PARENT_OBSERVATION="$candidate_a_parent_observation" \
  CANDIDATE_B_PARENT_OBSERVATION="$candidate_b_parent_observation" \
  CANDIDATE_B_STRAND_OBSERVATION="$candidate_b_strand_observation" \
  COMPLETED_BYTES="$completed_bytes" \
  CRASHED_BYTES="$crashed_bytes" \
  python3 - <<'PY'
import json
import os

a_receipt = json.loads(os.environ["CANDIDATE_A_RECEIPT"])
b_receipt = json.loads(os.environ["CANDIDATE_B_RECEIPT"])
a_preview = json.loads(os.environ["CANDIDATE_A_PREVIEW"])
a_settlement = json.loads(os.environ["CANDIDATE_A_SETTLEMENT"])
b_preview = json.loads(os.environ["CANDIDATE_B_PREVIEW"])
a_parent = json.loads(os.environ["CANDIDATE_A_PARENT_OBSERVATION"])
b_parent = json.loads(os.environ["CANDIDATE_B_PARENT_OBSERVATION"])
b_strand = json.loads(os.environ["CANDIDATE_B_STRAND_OBSERVATION"])

def require(condition, contract):
    if not condition:
        raise AssertionError(contract)

def require_equal(actual, expected, contract):
    if actual != expected:
        raise AssertionError(f"{contract}: expected {expected!r}, got {actual!r}")

def require_handle(value, contract):
    require(isinstance(value, dict), f"{contract}: expected an evidence handle object")
    require(isinstance(value.get("id"), str) and len(value["id"]) > 0, f"{contract}: expected a non-empty evidence id")

def require_handles(values, contract):
    require(isinstance(values, list) and len(values) > 0, f"{contract}: expected at least one evidence handle")
    for index, value in enumerate(values):
        require_handle(value, f"{contract}[{index}]")

require_equal(a_receipt["intent"]["namespace"], "workspace-session-event", "candidate A receipt preserves the application namespace")
require_equal(b_receipt["intent"]["namespace"], "workspace-session-event", "candidate B receipt preserves the application namespace")
require_equal(a_receipt["intent"]["properties"], {
    "eventIntentId": "intent:candidate-a-close",
    "workspaceSessionId": "workspace-session:shared",
    "eventBytesHex": os.environ["COMPLETED_BYTES"],
    "closeReason": "completed",
}, "candidate A receipt preserves its application event envelope")
require_equal(b_receipt["intent"]["properties"], {
    "eventIntentId": "intent:candidate-b-close",
    "workspaceSessionId": "workspace-session:shared",
    "eventBytesHex": os.environ["CRASHED_BYTES"],
    "closeReason": "crashed",
}, "candidate B receipt preserves its application event envelope")
require_equal(json.loads(bytes.fromhex(os.environ["COMPLETED_BYTES"])), {
    "closeReason": "completed",
    "eventIntentId": "intent:candidate-a-close",
    "schema": "example/workspace-session-event/v1",
    "workspaceSessionId": "workspace-session:shared",
}, "canonical bytes carry the complete candidate A event")
require_equal(json.loads(bytes.fromhex(os.environ["CRASHED_BYTES"])), {
    "closeReason": "crashed",
    "eventIntentId": "intent:candidate-b-close",
    "schema": "example/workspace-session-event/v1",
    "workspaceSessionId": "workspace-session:shared",
}, "canonical bytes carry the complete candidate B event")
require(a_receipt["occurrence"]["id"] != b_receipt["occurrence"]["id"], "candidate admissions retain distinct occurrence identities")
require(a_receipt["occurrence"]["subject"] != b_receipt["occurrence"]["subject"], "candidate events retain distinct graph subjects")

require_equal(a_preview["outcome"]["kind"], "derived", "candidate A is derivable at its unchanged fork basis")
require_equal(a_settlement["outcome"]["kind"], "derived", "candidate A settlement is admitted")
require_equal(a_settlement["plan"], a_preview["plan"], "settlement applies the exact reviewed plan")
require_handle(a_settlement["evidence"]["basis"], "settlement receipt carries a basis")
require_handles(a_settlement["evidence"]["support"], "settlement receipt carries supporting evidence")
require_handle(a_settlement["outcome"]["witness"]["admittedSuffix"], "derived settlement witnesses its admitted suffix")
require_handle(a_settlement["outcome"]["witness"]["resultingFrontier"], "derived settlement witnesses its resulting frontier")
require_handle(a_settlement["outcome"]["witness"]["authorityEvidence"], "derived settlement witnesses authority evidence")
require_equal(b_preview["outcome"]["kind"], "obstruction", "candidate B is not silently admitted after target movement")
require_equal(b_preview["outcome"]["witness"]["reason"], {
    "family": "unsupported-contract",
    "code": "git-warp.settlement-common-basis-required",
}, "candidate B reports the exact common-basis obstruction")
require_equal(b_preview["outcome"]["witness"]["retry"], {
    "disposition": "after-change",
}, "candidate B retry requires a changed basis")
require_handles(b_preview["outcome"]["witness"]["suppliedEvidence"], "candidate B obstruction identifies supplied evidence")
require_handles(b_preview["outcome"]["witness"]["requiredEvidence"], "candidate B obstruction identifies required evidence")
require_handle(b_preview["outcome"]["witness"]["failedCondition"], "candidate B obstruction identifies its failed condition")

require_equal(a_parent["readings"][0]["value"], os.environ["COMPLETED_BYTES"], "settlement preserves candidate A subject and exact bytes in the parent")
require_handle(a_parent["readings"][0]["coordinate"]["basis"], "settled candidate A remains basis-bound in the parent reading")
require(b_parent["readings"][0]["value"] is False, "obstructed candidate B remains absent from the parent")
require_equal(b_strand["readings"][0]["value"], os.environ["CRASHED_BYTES"], "obstructed candidate B remains recoverable in its source Strand")
require_handle(b_strand["readings"][0]["coordinate"]["basis"], "obstructed candidate B remains basis-bound in its source Strand")
PY
}
