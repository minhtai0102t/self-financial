import { beforeEach, describe, expect, it } from "vitest";

import { buildExpenseAnalytics } from "@/features/expenses/analytics";
import {
  applyOptimisticExpenseCreate,
  applyOptimisticExpenseDelete,
  applyOptimisticExpensePatch,
  buildOptimisticExpensesFromInput,
  clearCachedSnapshots,
  deriveSnapshotForPeriod,
  readCachedParsePreview,
  readCachedSnapshot,
  reconcileOptimisticExpenseCreate,
  rollbackOptimisticExpenseCreate,
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

  it("builds optimistic expenses in 0ms, enriches from history, and reconciles or rolls back cleanly", () => {
    const base = createBaseSnapshot();

    const plan = buildOptimisticExpensesFromInput({
      rawInput: "coffee 30k, lunch 50k",
      spentAtIso: "2026-10-18T12:00:00.000Z",
      existingExpenses: base.expenses,
      idPrefix: "test-1",
    });

    expect(plan.isHighConfidence).toBe(true);
    expect(plan.optimisticExpenses).toHaveLength(2);
    expect(plan.optimisticExpenses[0]?.id).toBe("optimistic-exp-test-1-0");

    const optimisticSnapshot = applyOptimisticExpenseCreate(
      base,
      plan.optimisticExpenses,
      {
        id: plan.batchId,
        rawInput: "coffee 30k, lunch 50k",
        aiModel: plan.modelUsed,
        createdAt: "2026-10-18T12:00:00.000Z",
      },
    );

    expect(optimisticSnapshot.expenses).toHaveLength(4);
    expect(optimisticSnapshot.analytics.totalVnd).toBe(615_000);
    expect(optimisticSnapshot.recentBatches).toHaveLength(1);

    // Reconcile optimistic IDs with server-persisted rows
    const serverSaved: SerializedExpense[] = [
      {
        ...plan.optimisticExpenses[0]!,
        id: "db-exp-101",
        batchId: "db-batch-99",
      },
      {
        ...plan.optimisticExpenses[1]!,
        id: "db-exp-102",
        batchId: "db-batch-99",
      },
    ];

    const reconciled = reconcileOptimisticExpenseCreate(
      optimisticSnapshot,
      plan.optimisticExpenses.map((e) => e.id),
      serverSaved,
      {
        id: "db-batch-99",
        rawInput: "coffee 30k, lunch 50k",
        aiModel: "smart-local-rules",
        createdAt: "2026-10-18T12:00:01.000Z",
        itemCount: 2,
        totalVnd: 80_000,
        totalFormatted: "80.000 VND",
      },
      plan.batchId,
    );

    expect(reconciled.expenses).toHaveLength(4);
    expect(reconciled.expenses.some((e) => e.id.startsWith("optimistic-"))).toBe(false);
    expect(reconciled.expenses.some((e) => e.id === "db-exp-101")).toBe(true);
    expect(reconciled.recentBatches[0]?.id).toBe("db-batch-99");

    // Rollback restores original expenses if server call fails
    const rolledBack = rollbackOptimisticExpenseCreate(
      optimisticSnapshot,
      plan.optimisticExpenses.map((e) => e.id),
      plan.batchId,
    );
    expect(rolledBack.expenses).toHaveLength(2);
    expect(rolledBack.analytics.totalVnd).toBe(535_000);
    expect(rolledBack.recentBatches).toHaveLength(0);
  });
});
