import { describe, expect, it } from "vitest";

import {
  formatVnd,
  getTierLabel,
  normalizeSpendingTier,
  shiftDateKey,
  toLocalDateKey,
} from "@/features/expenses/format";

describe("expense date selection", () => {
  it("uses the local calendar date rather than the UTC date", () => {
    expect(toLocalDateKey(new Date(2026, 10, 8, 0, 30))).toBe("2026-11-08");
  });

  it("moves between days across month and year boundaries", () => {
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDateKey("2026-02-28", 1)).toBe("2026-03-01");
    expect(shiftDateKey("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("formatVnd", () => {
  it("formats VND integers with dot thousands separators and VND suffix", () => {
    expect(formatVnd(30000)).toBe("30.000 VND");
    expect(formatVnd(50000)).toBe("50.000 VND");
    expect(formatVnd(1250000)).toBe("1.250.000 VND");
    expect(formatVnd(0)).toBe("0 VND");
  });
});

describe("normalizeSpendingTier", () => {
  it("maps human-readable and enum tier strings to canonical SpendingTier values", () => {
    expect(normalizeSpendingTier("Must have")).toBe("MUST_HAVE");
    expect(normalizeSpendingTier("MUST_HAVE")).toBe("MUST_HAVE");
    expect(normalizeSpendingTier("Nice to have")).toBe("NICE_TO_HAVE");
    expect(normalizeSpendingTier("NICE_TO_HAVE")).toBe("NICE_TO_HAVE");
    expect(normalizeSpendingTier("Wasted")).toBe("WASTED");
    expect(normalizeSpendingTier("WASTED")).toBe("WASTED");
  });

  it("returns human-readable labels for each tier", () => {
    expect(getTierLabel("MUST_HAVE")).toBe("Must have");
    expect(getTierLabel("NICE_TO_HAVE")).toBe("Nice to have");
    expect(getTierLabel("WASTED")).toBe("Wasted");
  });
});
