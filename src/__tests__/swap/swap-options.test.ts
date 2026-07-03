/**
 * Unit tests for the pure directed-swap eligibility filter in
 * src/lib/swap/swap-options.ts. A requester may only be offered active
 * colleagues of the SAME role, excluding themselves — mirroring the hard
 * role-compatibility block in the swap approval path.
 */
import { describe, it, expect } from "vitest";
import { eligibleSwapColleagues } from "@/lib/swap/swap-options";

const pool = [
  { id: "me", role: "RN", isActive: true },
  { id: "rn-active", role: "RN", isActive: true },
  { id: "rn-inactive", role: "RN", isActive: false },
  { id: "lpn-active", role: "LPN", isActive: true },
  { id: "cna-active", role: "CNA", isActive: true },
  { id: "rn-2", role: "RN", isActive: true },
];

describe("eligibleSwapColleagues", () => {
  it("returns only active, same-role colleagues, excluding self", () => {
    const result = eligibleSwapColleagues({ id: "me", role: "RN" }, pool);
    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual(["rn-2", "rn-active"]);
  });

  it("excludes the requester even if same role and active", () => {
    const result = eligibleSwapColleagues({ id: "me", role: "RN" }, pool);
    expect(result.some((r) => r.id === "me")).toBe(false);
  });

  it("excludes inactive same-role staff", () => {
    const result = eligibleSwapColleagues({ id: "me", role: "RN" }, pool);
    expect(result.some((r) => r.id === "rn-inactive")).toBe(false);
  });

  it("excludes different roles (no RN↔LPN or RN↔CNA offers)", () => {
    const result = eligibleSwapColleagues({ id: "me", role: "RN" }, pool);
    expect(result.some((r) => r.role !== "RN")).toBe(false);
  });

  it("matches on the requester's own role — an LPN sees only LPNs", () => {
    const lpnPool = [
      { id: "lpn-me", role: "LPN", isActive: true },
      { id: "lpn-other", role: "LPN", isActive: true },
      { id: "rn-x", role: "RN", isActive: true },
    ];
    const result = eligibleSwapColleagues({ id: "lpn-me", role: "LPN" }, lpnPool);
    expect(result.map((r) => r.id)).toEqual(["lpn-other"]);
  });

  it("returns an empty list when no colleague shares the role", () => {
    const result = eligibleSwapColleagues(
      { id: "solo", role: "RN" },
      [
        { id: "solo", role: "RN", isActive: true },
        { id: "a", role: "LPN", isActive: true },
      ]
    );
    expect(result).toEqual([]);
  });

  it("preserves extra fields on the pool rows (generic passthrough)", () => {
    const richPool = [
      { id: "me", role: "RN", isActive: true, name: "Me" },
      { id: "x", role: "RN", isActive: true, name: "Alex Rivera" },
    ];
    const result = eligibleSwapColleagues({ id: "me", role: "RN" }, richPool);
    expect(result).toEqual([
      { id: "x", role: "RN", isActive: true, name: "Alex Rivera" },
    ]);
  });
});
