import { describe, expect, it } from "vitest";

import {
  createTrieGeometryProfilePlan,
  formatTrieGeometryProfileReport,
  recommendTrieGeometryProfile,
  runTrieGeometryProfileScenario,
  type TrieGeometryProfileRow,
} from "../../benchmark/trieGeometryProfile.fixture.ts";

describe("Trie geometry profile harness", () => {
  it("runs the default matrix when GIT_WARP_PROFILE=1", async () => {
    if (process.env["GIT_WARP_PROFILE"] !== "1") {
      expect(process.env["GIT_WARP_PROFILE"]).not.toBe("1");
      return;
    }

    const rows: TrieGeometryProfileRow[] = [];
    const onlyLabel = process.env["GIT_WARP_PROFILE_ONLY_LABEL"] ?? null;
    const scenarios = createTrieGeometryProfilePlan()
      .filter((scenario) => onlyLabel === null || scenario.label === onlyLabel);
    for (const scenario of scenarios) {
      const row = await runTrieGeometryProfileScenario(scenario);
      rows.push(row);
      console.log(
        `    ${row.label}: build=${row.trieBuildMs.toFixed(2)}ms read=${row.trieReadMs.toFixed(2)}ms heapΔ=${row.heapDeltaMb.toFixed(2)}MB hit=${row.pageHitRatio.toFixed(2)}`,
      );
    }

    const recommendation = recommendTrieGeometryProfile(rows);
    console.log("");
    console.log(formatTrieGeometryProfileReport({ recommendation, rows }));

    expect(rows).toHaveLength(scenarios.length);
  }, 300_000);

  it("runs the 1M-entry stress scale when GIT_WARP_PROFILE_STRESS=1", async () => {
    if (process.env["GIT_WARP_PROFILE_STRESS"] !== "1") {
      expect(process.env["GIT_WARP_PROFILE_STRESS"]).not.toBe("1");
      return;
    }

    const rows: TrieGeometryProfileRow[] = [];
    const onlyLabel = process.env["GIT_WARP_PROFILE_ONLY_LABEL"] ?? null;
    const scenarios = createTrieGeometryProfilePlan({ includeStress: true })
      .filter((scenario) => scenario.totalEntries === 1_000_000)
      .filter((scenario) => onlyLabel === null || scenario.label === onlyLabel);
    for (const scenario of scenarios) {
      const row = await runTrieGeometryProfileScenario(scenario);
      rows.push(row);
      console.log(
        `    stress ${row.label}: build=${row.trieBuildMs.toFixed(2)}ms read=${row.trieReadMs.toFixed(2)}ms heapΔ=${row.heapDeltaMb.toFixed(2)}MB hit=${row.pageHitRatio.toFixed(2)}`,
      );
    }

    if (rows.length > 0) {
      const recommendation = recommendTrieGeometryProfile(rows);
      console.log("");
      console.log(formatTrieGeometryProfileReport({ recommendation, rows }));
    }

    if (onlyLabel === null) {
      expect(rows.length).toBeGreaterThan(0);
    }
    expect(rows).toHaveLength(scenarios.length);
    for (const row of rows) {
      expect(row.totalEntries).toBe(1_000_000);
    }
  }, 900_000);
});
