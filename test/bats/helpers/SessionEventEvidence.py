"""Explicit conformance checks; Python optimization must not remove the oracle."""
import copy
import json
from pathlib import Path
import sys


# Three writes, two forks, two previews/applies each, four repairs, thirteen reads.
EXPECTED_PUBLIC_CALLS = 26


class ProofFailure(RuntimeError):
    pass


def require(condition, code):
    if not condition:
        raise ProofFailure(code)


def handle(value, code):
    require(isinstance(value, dict) and isinstance(value.get("id"), str) and bool(value["id"]), code)
    return value["id"]


def reading(frame):
    require(frame["type"] == "Observation" and len(frame["readings"]) == 1, "reading-shape")
    value = frame["readings"][0]
    require(value["type"] == "Reading" and frame["receipt"]["status"] == "completed", "reading-completed")
    require(value["coordinate"]["basis"] == frame["receipt"]["evidence"]["basis"], "reading-basis-bound")
    require(value["coordinate"]["tick"]["id"] == frame["receipt"]["evidence"]["tick"]["id"], "reading-tick-bound")
    require(value["support"]["status"] == "supported", "reading-supported")
    return value


def identities(data):
    subjects, occurrences = [], []
    for name, event in data["events"].items():
        receipt, intent = event["receipt"], event["intent"]
        require(receipt["type"] == "Receipt" and receipt["operation"] == "write", "write-receipt")
        require(receipt["intent"] == intent, "application-identities-preserved")
        application = intent["properties"]
        subject = receipt["occurrence"]["subject"]
        occurrence = handle(receipt["occurrence"], "causal-occurrence-identity")
        require(isinstance(subject, str) and bool(subject), "allocated-graph-subject")
        require(len({application["applicationIntent"], application["applicationSubject"], subject, occurrence}) == 4,
                "identity-conflation")
        require(application["applicationIntent"] == "application-intent:capture:" + name, "application-intent-identity")
        require(application["applicationSubject"] == "session:shared", "application-subject-identity")
        subjects.append(subject)
        occurrences.append(occurrence)
    require(len(set(subjects)) == 3 and len(set(occurrences)) == 3, "distinct-birth-identities")


def birth_support(data):
    for event in data["events"].values():
        receipt = event["receipt"]
        require(len(receipt["evidence"]["support"]) == 1, "one-birth-one-support")
        handle(receipt["evidence"]["support"][0], "birth-support-handle")
        handle(receipt["evidence"]["basis"], "birth-basis")
        require(receipt["outcome"]["kind"] == "derived" and receipt["outcome"]["residual"]["kind"] == "advanced",
                "birth-derived")
        require(receipt["reason"] is None, "birth-reason")
        require(any(item["policy"] == "pinned" and item["rootKind"] == "publication" and
                    item["reachability"] == "anchored" and handle(item["witness"], "retention-witness")
                    for item in receipt["evidence"]["retention"]), "retained-publication")


def retained_properties(data, name, frames):
    for key in ("applicationIntent", "applicationSubject", "payload"):
        actual = reading(frames[key])["value"]
        expected = data["events"][name]["intent"]["properties"][key]
        require(type(actual) is str and actual.encode("utf-8") == expected.encode("utf-8"), "opaque-restart-bytes")


def direct_restart(data):
    retained_properties(data, "direct", data["directReadings"])


def settlement_plan(data, name):
    preview, applied = data[name + "Preview"], data[name + "Apply"]
    plan = preview["plan"]
    require(preview["type"] == "SettlementPreview" and preview["operation"] == "preview-settlement", "preview-shape")
    require(preview["selector"] == {"sourceLane": "events", "sourceStrand": name, "targetLane": "events"}, "selector-bound")
    require(preview["source"] == {"kind": "strand", "name": name} and
            preview["target"] == {"kind": "worldline", "name": "events"}, "explicit-candidate-authority")
    require(preview == data[name + "PlanFile"] and plan == applied["plan"], "exact-settlement-plan")
    require(plan["invalidationRule"] == "any-bound-input-change" and plan["sourceLaneId"] == "strand:" + name and
            plan["targetLaneId"] == "worldline:events", "exact-frontier-contract")
    bound = [handle(plan["sourceFrontier"], "source-frontier")]
    handle(plan["targetFrontier"], "target-frontier")
    for key in ("proposalDigest", "lawDigest", "policyDigest", "planDigest"):
        require(type(plan[key]) is str and bool(plan[key]), "plan-digest")
        bound.append(plan[key])
    for frame in (preview, applied):
        require(frame["evidence"]["basis"] == plan["targetFrontier"], "settlement-basis-bound")
        support = [handle(item, "settlement-support-handle") for item in frame["evidence"]["support"]]
        require(set(bound).issubset(support), "complete-settlement-support")
    require(len(preview["evidence"]["support"]) == 5, "complete-preview-support")
    require(applied["type"] == "Receipt" and applied["operation"] == "settle", "apply-receipt")
    require(applied["outcome"] == preview["outcome"], "exact-preview-apply-classification")
    return preview["outcome"]


def alpha_derived(data):
    outcome = settlement_plan(data, "alpha")
    require(outcome["kind"] == "derived" and outcome["residual"]["kind"] == "advanced", "alpha-derived-classification")
    witness = outcome["witness"]
    for key in ("admittedSuffix", "authorityEvidence", "directExtensionEvidence", "resultingFrontier"):
        handle(witness[key], "derived-witness")
    require(witness["resultingFrontier"] == outcome["residual"]["frontier"], "derived-frontier")
    evaluation = witness["evaluation"]
    for key in ("sourceBasis", "destinationBasis", "law", "profile", "proposal", "coordinate"):
        handle(evaluation[key], "complete-derived-evaluation")
    require(evaluation["destinationRuntime"] == "worldline:events" and
            evaluation["sourceParticipant"] == "strand:alpha", "derived-authority")
    require(data["alphaApply"]["reason"] is None and len(data["alphaApply"]["evidence"]["support"]) == 7,
            "complete-promotion-evidence")


def beta_obstruction(data):
    outcome = settlement_plan(data, "beta")
    require(outcome["kind"] == "obstruction" and outcome["residual"]["kind"] == "unchanged", "beta-obstruction-classification")
    witness = outcome["witness"]
    require(witness["reason"]["code"] == "git-warp.settlement-common-basis-required", "stale-common-basis-reason")
    require(witness["reason"]["family"] == "unsupported-contract", "obstruction-family")
    handle(witness["failedCondition"], "obstruction-failed-condition")
    require(witness["retry"] == {"disposition": "after-change"}, "obstruction-retry")
    evaluation = witness["evaluation"]
    for key in ("sourceBasis", "destinationBasis", "law", "profile", "proposal", "coordinate"):
        handle(evaluation[key], "complete-obstruction-evaluation")
    require(evaluation["destinationRuntime"] == "worldline:events" and
            evaluation["sourceParticipant"] == "strand:beta", "obstruction-authority")
    for key in ("requiredEvidence", "suppliedEvidence"):
        require(bool(witness[key]), "obstruction-evidence")
        for item in witness[key]:
            handle(item, "obstruction-evidence-handle")
    require(data["betaApply"]["reason"] == "git-warp.settlement-common-basis-required", "apply-obstruction-reason")


def retained_sources(data):
    for name in ("alpha", "beta"):
        require(data["forks"][name] == {"type": "Lane", "kind": "strand", "name": name,
                "source": {"kind": "worldline", "name": "events"}, "writer": "proof"}, "explicit-source-strand")
        retained_properties(data, name, data["sourceReadings"][name])


def target_authority(data):
    expected = data["events"]["alpha"]["intent"]["properties"]["payload"]
    for key in ("alphaTarget", "alphaTargetAfter"):
        require(reading(data[key])["value"] == expected, "settled-target-visible")
    for key in ("betaAbsentBefore", "betaAbsentAfter"):
        require(reading(data[key])["value"] is False, "no-forced-winner")
    require(data["betaAbsentBefore"] == data["betaAbsentAfter"], "no-partial-publication")


def negative_basis(data):
    for key in ("betaAbsentBefore", "betaAbsentAfter"):
        value = reading(data[key])
        handle(value["coordinate"]["basis"], "negative-reading-basis")
        handle(value["coordinate"]["tick"], "negative-reading-tick")
        require(value["coordinate"]["lane"] == "events" and value["coordinate"]["tick"]["lane"] == "events",
                "negative-reading-lane")
        require(value["support"]["evidence"] == data[key]["receipt"]["evidence"]["support"], "negative-support-bound")
        for support in value["support"]["evidence"]:
            handle(support, "negative-support-handle")


def process_boundaries(data):
    calls = data["calls"]
    require(len(calls) == EXPECTED_PUBLIC_CALLS and len({call["pid"] for call in calls}) == len(calls), "fresh-cli-processes")
    require(all(call["exit"] == 0 and type(call["pid"]) is int and call["pid"] > 0 for call in calls), "cli-completion")


CHECKS = {
    "identities": identities, "birth-support": birth_support, "direct-restart": direct_restart,
    "alpha-derived": alpha_derived, "beta-obstruction": beta_obstruction, "retained-sources": retained_sources,
    "target-authority": target_authority, "negative-basis": negative_basis, "process-boundaries": process_boundaries,
}


def calibrate(data):
    changes = [
        ("identity-conflation", identities, lambda value: value["events"]["direct"]["receipt"]["occurrence"].update(
            subject=value["events"]["direct"]["intent"]["properties"]["applicationSubject"])),
        ("one-birth-one-support", birth_support, lambda value: value["events"]["direct"]["receipt"]["evidence"].update(support=[])),
        ("opaque-restart-bytes", direct_restart, lambda value: value["directReadings"]["payload"]["readings"][0].update(value="truncated")),
        ("complete-settlement-support", alpha_derived, lambda value: [frame["evidence"].update(support=[]) for frame in (value["alphaPreview"], value["alphaPlanFile"])]),
        ("stale-common-basis-reason", beta_obstruction, lambda value: [frame["outcome"]["witness"]["reason"].update(code="forced-winner")
            for frame in (value["betaPreview"], value["betaPlanFile"], value["betaApply"])]),
        ("no-forced-winner", target_authority, lambda value: value["betaAbsentAfter"]["readings"][0].update(value=True)),
        ("reading-basis-bound", negative_basis, lambda value: value["betaAbsentAfter"]["readings"][0]["coordinate"].update(basis={"id": "wrong-basis"})),
    ]
    for code, check, change in changes:
        corrupted = copy.deepcopy(data)
        change(corrupted)
        try:
            check(corrupted)
        except ProofFailure as error:
            require(str(error) == code, "calibration-wrong-failure:" + code + ":" + str(error))
            print("RED witnessed: " + code)
        else:
            raise ProofFailure("calibration-accepted-invalid-evidence:" + code)


if __name__ == "__main__":
    snapshot = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    selection = sys.argv[2]
    try:
        if selection == "calibrations":
            calibrate(snapshot)
        else:
            CHECKS[selection](snapshot)
        print("GREEN: " + selection)
    except ProofFailure as error:
        print("conformance failure: " + str(error), file=sys.stderr)
        sys.exit(1)
