# DX_risk-hotspot-ci-dashboard

**Title:** Risk hotspot dashboard in CI

## Idea

The risk analysis (churn x LOC x coupling) identified clear hotspots:
WarpRuntime (944), PatchBuilderV2 (920), JoinReducer (675),
GitGraphAdapter (378). What if CI computed these scores on every PR and
flagged files whose risk increased? A simple script that runs git log +
import counting + wc -l and reports: "This PR increases the risk score
of JoinReducer.js from 675 to 720 (+7%). Consider decomposition." The
threshold for warning could be risk > 500. This would catch god-object
growth before it happens.
