import { describe, expect, it } from "vitest";

import {
  TRIE_GEOMETRY_PROFILE_DEFAULT_SCALES,
  TRIE_GEOMETRY_PROFILE_STRESS_SCALE,
  TRIE_GEOMETRY_PROFILE_VARIANTS,
  createTrieGeometryProfilePlan,
  formatTrieGeometryProfileReport,
  recommendTrieGeometryProfile,
} from "../../benchmark/trieGeometryProfile.fixture.ts";

describe("trie geometry profile fixture", () => {
  it("enumerates a deterministic default matrix plus an optional stress scale", () => {
    const defaultPlan = createTrieGeometryProfilePlan();
    const stressPlan = createTrieGeometryProfilePlan({ includeStress: true });

    expect(TRIE_GEOMETRY_PROFILE_DEFAULT_SCALES).toEqual([
      1_000,
      10_000,
      100_000,
    ]);
    expect(TRIE_GEOMETRY_PROFILE_STRESS_SCALE).toBe(1_000_000);
    expect(TRIE_GEOMETRY_PROFILE_VARIANTS.map((variant) => variant.name)).toEqual([
      "f16-l64-c128",
      "f16-l32-c64",
      "f256-l64-c128",
    ]);
    expect(defaultPlan).toHaveLength(
      TRIE_GEOMETRY_PROFILE_DEFAULT_SCALES.length
      * TRIE_GEOMETRY_PROFILE_VARIANTS.length,
    );
    expect(stressPlan).toHaveLength(defaultPlan.length + TRIE_GEOMETRY_PROFILE_VARIANTS.length);
    expect(new Set(defaultPlan.map((scenario) => scenario.label)).size).toBe(defaultPlan.length);
    expect(stressPlan.some((scenario) => scenario.totalEntries === TRIE_GEOMETRY_PROFILE_STRESS_SCALE)).toBe(true);
  });

  it("formats a markdown report with recommendation and scenario rows", () => {
    const report = formatTrieGeometryProfileReport({
      recommendation: {
        variantName: "f16-l64-c128",
        fanout: 16,
        leafCapacity: 64,
        leafFloor: 16,
        maxResident: 128,
        testedScales: [1_000, 10_000, 100_000],
        rationale: "balanced runtime and memory posture",
      },
      rows: [
        {
          label: "f16-l64-c128@10000",
          totalEntries: 10_000,
          fanout: 16,
          leafCapacity: 64,
          leafFloor: 16,
          maxResident: 128,
          trieBuildMs: 12.5,
          trieReadMs: 8.2,
          baselineBuildMs: 3.1,
          heapDeltaMb: 4.2,
          rssDeltaMb: 7.4,
          pageHitRatio: 0.61,
          pageFaultRate: 0.39,
          evictions: 9,
          writeCount: 27,
          maxDepth: 3,
          averageLeafOccupancy: 22.4,
        },
      ],
    });

    expect(report).toContain("## Recommendation");
    expect(report).toContain("balanced runtime and memory posture");
    expect(report).toContain("Variant: `f16-l64-c128`");
    expect(report).toContain("| Scenario | Entries | Fanout | Leaf cap | Cache |");
    expect(report).toContain("f16-l64-c128@10000");
    expect(report).toContain("0.61");
  });

  it("recommends a default variant across scales instead of the smallest single scenario", () => {
    const recommendation = recommendTrieGeometryProfile([
      {
        label: "f16-l64-c128@1000",
        totalEntries: 1_000,
        fanout: 16,
        leafCapacity: 64,
        leafFloor: 16,
        maxResident: 128,
        trieBuildMs: 10,
        trieReadMs: 5,
        baselineBuildMs: 1,
        heapDeltaMb: 1,
        rssDeltaMb: 1,
        pageHitRatio: 0,
        pageFaultRate: 1,
        evictions: 1,
        writeCount: 10,
        maxDepth: 1,
        averageLeafOccupancy: 20,
      },
      {
        label: "f16-l32-c64@1000",
        totalEntries: 1_000,
        fanout: 16,
        leafCapacity: 32,
        leafFloor: 8,
        maxResident: 64,
        trieBuildMs: 8,
        trieReadMs: 4,
        baselineBuildMs: 1,
        heapDeltaMb: 1,
        rssDeltaMb: 1,
        pageHitRatio: 0,
        pageFaultRate: 1,
        evictions: 5,
        writeCount: 30,
        maxDepth: 2,
        averageLeafOccupancy: 8,
      },
      {
        label: "f16-l64-c128@10000",
        totalEntries: 10_000,
        fanout: 16,
        leafCapacity: 64,
        leafFloor: 16,
        maxResident: 128,
        trieBuildMs: 100,
        trieReadMs: 20,
        baselineBuildMs: 5,
        heapDeltaMb: 20,
        rssDeltaMb: 30,
        pageHitRatio: 0,
        pageFaultRate: 1,
        evictions: 5,
        writeCount: 100,
        maxDepth: 2,
        averageLeafOccupancy: 18,
      },
      {
        label: "f16-l32-c64@10000",
        totalEntries: 10_000,
        fanout: 16,
        leafCapacity: 32,
        leafFloor: 8,
        maxResident: 64,
        trieBuildMs: 130,
        trieReadMs: 30,
        baselineBuildMs: 5,
        heapDeltaMb: 25,
        rssDeltaMb: 35,
        pageHitRatio: 0,
        pageFaultRate: 1,
        evictions: 20,
        writeCount: 200,
        maxDepth: 3,
        averageLeafOccupancy: 10,
      },
    ]);

    expect(recommendation.variantName).toBe("f16-l64-c128");
    expect(recommendation.testedScales).toEqual([1_000, 10_000]);
  });
});
