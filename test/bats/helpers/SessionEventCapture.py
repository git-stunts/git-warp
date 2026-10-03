"""Capture consumer evidence exclusively through fresh public CLI processes."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def capture(cli_path):
    evidence = {"events": {}, "calls": []}
    with tempfile.TemporaryDirectory(prefix="session-event-proof-") as repo:
        for args in (["git", "init", "-q", repo],
                     ["git", "-C", repo, "config", "user.name", "Session Event Proof"],
                     ["git", "-C", repo, "config", "user.email", "proof@example.invalid"]):
            subprocess.run(args, check=True, capture_output=True, timeout=30)

        def call(name, *arguments):
            command = ["node", str(cli_path), "--repo", repo, "--writer", "proof", "--json", *arguments]
            with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as process:
                try:
                    stdout, stderr = process.communicate(timeout=30)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.communicate()
                    raise RuntimeError("public CLI deadline exceeded: " + name) from None
                if process.returncode != 0:
                    raise RuntimeError(name + " refused: " + stderr.decode("utf-8"))
                value = json.loads(stdout)
                evidence["calls"].append({"name": name, "pid": process.pid, "exit": process.returncode})
                return value

        def event(name):
            intent_id = "application-intent:capture:" + name
            subject_id = "session:shared"
            payload = json.dumps({
                "intentId": intent_id, "subjectId": subject_id, "kind": "session.observed",
                "data": {"message": "π e\u0301 😀 \\\nopaque\r\n\u0000", "sequence": name},
            }, ensure_ascii=False, indent=2)
            intent = {"kind": "entity.add", "namespace": "session-event", "properties": {
                "applicationIntent": intent_id, "applicationSubject": subject_id, "payload": payload,
            }}
            selector = [] if name == "direct" else ["--strand", name]
            receipt = call(name + ".write", "write", "--lane", "events", *selector,
                           "--intent", json.dumps(intent, ensure_ascii=False))
            evidence["events"][name] = {"intent": intent, "receipt": receipt}

        def repair(name=None):
            selector = [] if name is None else ["--strand", name]
            result = call("repair." + (name or "target"), "repair", "--lane", "events", *selector,
                          "--action", "materialization")
            if result.get("status") != "completed":
                raise RuntimeError("materialization did not complete")

        def reading(name, key=None, strand=None):
            subject = evidence["events"][name]["receipt"]["occurrence"]["subject"]
            descriptor = {"kind": "node.exists", "subject": subject} if key is None else {
                "kind": "property.get", "subject": subject, "key": key,
            }
            selector = [] if strand is None else ["--strand", strand]
            return call("read." + name + "." + (key or "exists") + "." + (strand or "target"),
                        "observe", "--lane", "events", *selector, "--observer", "proof." + (key or "exists"),
                        "--reading", json.dumps(descriptor))

        event("direct")
        repair()
        evidence["directReadings"] = {key: reading("direct", key) for key in (
            "applicationIntent", "applicationSubject", "payload")}
        evidence["forks"] = {name: call("fork." + name, "fork", "--lane", "events", "--name", name)
                             for name in ("alpha", "beta")}
        event("alpha")
        event("beta")
        alpha_plan = str(Path(repo) / "alpha-plan.json")
        evidence["alphaPreview"] = call("alpha.preview", "settle", "preview", "--source", "events",
                                        "--strand", "alpha", "--target", "events", "--out", alpha_plan)
        evidence["alphaPlanFile"] = json.loads(Path(alpha_plan).read_text(encoding="utf-8"))
        evidence["alphaApply"] = call("alpha.apply", "settle", "apply", "--plan", alpha_plan)
        repair()
        evidence["alphaTarget"] = reading("alpha", "payload")
        evidence["betaAbsentBefore"] = reading("beta")
        beta_plan = str(Path(repo) / "beta-plan.json")
        evidence["betaPreview"] = call("beta.preview", "settle", "preview", "--source", "events",
                                       "--strand", "beta", "--target", "events", "--out", beta_plan)
        evidence["betaPlanFile"] = json.loads(Path(beta_plan).read_text(encoding="utf-8"))
        evidence["betaApply"] = call("beta.apply", "settle", "apply", "--plan", beta_plan)
        evidence["betaAbsentAfter"] = reading("beta")
        evidence["alphaTargetAfter"] = reading("alpha", "payload")
        evidence["sourceReadings"] = {}
        for name in ("alpha", "beta"):
            repair(name)
            evidence["sourceReadings"][name] = {key: reading(name, key, name) for key in (
                "applicationIntent", "applicationSubject", "payload")}
    return evidence


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[3]
    subprocess.run(["node", str(root / "scripts" / "RequireDockerTests.ts")], check=True, timeout=30)
    output = Path(sys.argv[1])
    cli = root / "dist" / "bin" / "git-warp.js"
    output.write_text(json.dumps(capture(cli), ensure_ascii=False, indent=2), encoding="utf-8")
