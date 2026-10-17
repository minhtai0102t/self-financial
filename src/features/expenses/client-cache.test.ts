import { beforeEach, describe, expect, it } from "vitest";

import { buildExpenseAnalytics } from "@/features/expenses/analytics";
import {
  applyOptimisticExpenseDelete,
  applyOptimisticExpensePatch,
  clearCachedSnapshots,
  deriveSnapshotForPeriod,
  readCachedParsePreview,
  readCachedSnapshot,
  writeCachedParsePreview,
  writeCachedSnapshot,
} from "@/features/expenses/client-cache";
import type { DashboardSnapshot, SerializedExpense } from "@/features/expenses/service";

const SAMPLE_EXPENSES: SerializedExpense[] = [
  {
    id: "exp-1",
    batchId: "b-1",
    title: "Morning Coffee",
    amountVnd: 35_000,
    formattedAmount: "35.000 VND",
    currency: "VND",
    tier: "NICE_TO_HAVE",
    tierLabel: "Nice to have",
    category: "Food & Drink",
    aiReason: "Daily coffee treat",
    spentAt: "2026-10-17T02:00:00.000Z",
    createdAt: "2026-10-17T02:00:00.000Z",
  },
  {
    id: "exp-2",
    batchId: "b-1",
    title: "August Trip",
    amountVnd: 500_000,
    formattedAmount: "500.000 VND",
    currency: "VND",
    tier: "MUST_HAVE",
    tierLabel: "Must have",
    category: "Transport",
    aiReason: "Intercity bus",
    spentAt: "2026-08-10T08:00:00.000Z",
    createdAt: "2026-08-10T08:00:00.000Z",
  },
];

function createBaseSnapshot(): DashboardSnapshot {
  return {
    period: "all",
    expenses: SAMPLE_EXPENSES,
    analytics: buildExpenseAnalytics(SAMPLE_EXPENSES),
    categories: ["Food & Drink", "Transport"],
    recentBatches: [],
  };
}

describe("client-cache", () => {
  beforeEach(() => {
    clearCachedSnapshots();
  });

  it("derives period snapshot synchronously from base 'all' snapshot", () => {
    const base = createBaseSnapshot();
    const now = new Date("2026-10-17T09:00:00.000Z");

    const monthSnapshot = deriveSnapshotForPeriod(base, "month", now);
    expect(monthSnapshot.period).toBe("month");
    expect(monthSnapshot.expenses).toHaveLength(1);
    expect(monthSnapshot.expenses[0]?.id).toBe("exp-1");
    expect(monthSnapshot.analytics.totalVnd).toBe(35_000);
    expect(monthSnapshot.categories).toEqual(["Food & Drink"]);

    const yearSnapshot = deriveSnapshotForPeriod(base, "year", now);
    expect(yearSnapshot.expenses).toHaveLength(2);
    expect(yearSnapshot.analytics.totalVnd).toBe(535_000);
  });

  it("applies optimistic expense patches and deletions with recalculated analytics", () => {
    const base = createBaseSnapshot();

    const patched = applyOptimisticExpensePatch(base, "exp-1", {
      tier: "WASTED",
      amountVnd: 45_000,
    });

    const updatedItem = patched.expenses.find((e) => e.id === "exp-1");
    expect(updatedItem?.tier).toBe("WASTED");
    expect(updatedItem?.tierLabel).toBe("Wasted");
    expect(updatedItem?.formattedAmount).toBe("45.000 VND");
    expect(patched.analytics.totalVnd).toBe(545_000);
    expect(patched.analytics.byTier.WASTED.amountVnd).toBe(45_000);

    const afterDelete = applyOptimisticExpenseDelete(patched, "exp-1");
    expect(afterDelete.expenses).toHaveLength(1);
    expect(afterDelete.analytics.totalVnd).toBe(500_000);
  });

  it("stores and retrieves SWR snapshots and parse previews with staleness detection", () => {
    const base = createBaseSnapshot();
    writeCachedSnapshot("user@example.com", base, 1_000);

    const fresh = readCachedSnapshot("user@example.com", "all", 2_000);
    expect(fresh).not.toBeNull();
    expect(fresh?.isStale).toBe(false);
    expect(fresh?.snapshot.analytics.totalVnd).toBe(535_000);

    // After TTL (default 5 minutes = 300_000ms), entry is marked stale but still returned for instant UI render
    const stale = readCachedSnapshot("user@example.com", "all", 400_000);
    expect(stale).not.toBeNull();
    expect(stale?.isStale).toBe(true);

    writeCachedParsePreview("  Coffee 30k  ", {
      items: [
        {
          title: "Coffee",
          amountVnd: 30_000,
          formattedAmount: "30.000 VND",
          currency: "VND",
          tier: "NICE_TO_HAVE",
          category: "Food & Drink",
          aiReason: "Coffee",
        },
      ],
      modelUsed: "gemini-2.5-flash",
    });

    const cachedPreview = readCachedParsePreview("coffee 30k");
    expect(cachedPreview?.modelUsed).toBe("gemini-2.5-flash");
    expect(cachedPreview?.items).toHaveLength(1);
  });
});
