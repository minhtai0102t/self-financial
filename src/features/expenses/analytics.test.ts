import { describe, expect, it } from "vitest";

import {
  buildExpenseAnalytics,
  filterExpensesByPeriod,
  resolvePeriodStart,
} from "@/features/expenses/analytics";

describe("buildExpenseAnalytics", () => {
  it("computes totals, tier percentages, category breakdown, daily series, and wasted insights", () => {
    const analytics = buildExpenseAnalytics([
      {
        id: "1",
        title: "Coffee",
        amountVnd: 30_000,
        currency: "VND",
        tier: "NICE_TO_HAVE",
        category: "Food & Drink",
        aiReason: "Morning coffee treat",
        spentAt: new Date("2026-10-16T08:30:00.000Z"),
      },
      {
        id: "2",
        title: "Lunch",
        amountVnd: 50_000,
        currency: "VND",
        tier: "MUST_HAVE",
        category: "Food & Drink",
        aiReason: "Essential daily meal",
        spentAt: new Date("2026-10-16T12:15:00.000Z"),
      },
      {
        id: "3",
        title: "Impulse Game Skin",
        amountVnd: 120_000,
        currency: "VND",
        tier: "WASTED",
        category: "Entertainment",
        aiReason: "Impulse in-game cosmetic",
        spentAt: new Date("2026-10-15T20:00:00.000Z"),
      },
    ]);

    expect(analytics.totalVnd).toBe(200_000);
    expect(analytics.totalFormatted).toBe("200.000 VND");
    expect(analytics.expenseCount).toBe(3);

    expect(analytics.byTier.MUST_HAVE).toMatchObject({
      amountVnd: 50_000,
      formattedAmount: "50.000 VND",
      count: 1,
      percentage: 25,
    });
    expect(analytics.byTier.NICE_TO_HAVE).toMatchObject({
      amountVnd: 30_000,
      formattedAmount: "30.000 VND",
      count: 1,
      percentage: 15,
    });
    expect(analytics.byTier.WASTED).toMatchObject({
      amountVnd: 120_000,
      formattedAmount: "120.000 VND",
      count: 1,
      percentage: 60,
      isOverRecommended: true,
    });

    expect(analytics.byCategory[0]).toMatchObject({
      category: "Entertainment",
      amountVnd: 120_000,
      count: 1,
    });
    expect(analytics.byCategory[1]).toMatchObject({
      category: "Food & Drink",
      amountVnd: 80_000,
      count: 2,
    });

    expect(analytics.dailySeries).toHaveLength(2);
    expect(analytics.dailySeries[0]?.date).toBe("2026-10-15");
    expect(analytics.dailySeries[1]?.date).toBe("2026-10-16");
    expect(analytics.insights.length).toBeGreaterThan(0);
  });

  it("builds monthly, quarterly, and yearly spend tracking series with period-over-period deltas", () => {
    const analytics = buildExpenseAnalytics([
      {
        id: "y1",
        title: "2025 Rent",
        amountVnd: 1_000_000,
        currency: "VND",
        tier: "MUST_HAVE",
        category: "Housing",
        aiReason: "Housing",
        spentAt: new Date("2025-12-10T10:00:00.000Z"),
      },
      {
        id: "q3-1",
        title: "September Groceries",
        amountVnd: 400_000,
        currency: "VND",
        tier: "MUST_HAVE",
        category: "Food & Drink",
        aiReason: "Groceries",
        spentAt: new Date("2026-09-15T10:00:00.000Z"),
      },
      {
        id: "q4-1",
        title: "October Electricity",
        amountVnd: 500_000,
        currency: "VND",
        tier: "MUST_HAVE",
        category: "Bills & Utilities",
        aiReason: "Utility bill",
        spentAt: new Date("2026-10-05T10:00:00.000Z"),
      },
      {
        id: "q4-2",
        title: "October Impulse Gadget",
        amountVnd: 300_000,
        currency: "VND",
        tier: "WASTED",
        category: "Shopping",
        aiReason: "Impulse gadget",
        spentAt: new Date("2026-10-12T10:00:00.000Z"),
      },
    ]);

    expect(analytics.monthlySeries).toHaveLength(3);
    expect(analytics.monthlySeries[0]).toMatchObject({
      key: "2025-12",
      label: "Dec 2025",
      totalVnd: 1_000_000,
      count: 1,
      changePct: null,
    });
    expect(analytics.monthlySeries[1]).toMatchObject({
      key: "2026-09",
      label: "Sep 2026",
      totalVnd: 400_000,
      count: 1,
      changePct: -60,
    });
    expect(analytics.monthlySeries[2]).toMatchObject({
      key: "2026-10",
      label: "Oct 2026",
      totalVnd: 800_000,
      mustHaveVnd: 500_000,
      wastedVnd: 300_000,
      count: 2,
      changePct: 100,
    });

    expect(analytics.quarterlySeries).toHaveLength(3);
    expect(analytics.quarterlySeries[0]).toMatchObject({
      key: "2025-Q4",
      label: "Q4 2025",
      totalVnd: 1_000_000,
      changePct: null,
    });
    expect(analytics.quarterlySeries[1]).toMatchObject({
      key: "2026-Q3",
      label: "Q3 2026",
      totalVnd: 400_000,
      changePct: -60,
    });
    expect(analytics.quarterlySeries[2]).toMatchObject({
      key: "2026-Q4",
      label: "Q4 2026",
      totalVnd: 800_000,
      changePct: 100,
    });

    expect(analytics.yearlySeries).toHaveLength(2);
    expect(analytics.yearlySeries[0]).toMatchObject({
      key: "2025",
      label: "2025",
      totalVnd: 1_000_000,
      changePct: null,
    });
    expect(analytics.yearlySeries[1]).toMatchObject({
      key: "2026",
      label: "2026",
      totalVnd: 1_200_000,
      changePct: 20,
    });
  });

  it("resolves period start dates and filters expenses for month, quarter, and year", () => {
    const now = new Date("2026-10-17T09:00:00.000Z");
    const items = [
      { id: "today", spentAt: "2026-10-17T02:00:00.000Z" },
      { id: "month", spentAt: "2026-10-02T10:00:00.000Z" },
      { id: "prev-quarter", spentAt: "2026-08-15T10:00:00.000Z" },
      { id: "prev-year", spentAt: "2025-11-20T10:00:00.000Z" },
    ];

    expect(resolvePeriodStart("quarter", now)?.getMonth()).toBe(9); // Oct is month index 9 (Q4 start)
    expect(resolvePeriodStart("year", now)?.getMonth()).toBe(0); // Jan is month index 0

    expect(filterExpensesByPeriod(items, "month", now).map((i) => i.id)).toEqual([
      "today",
      "month",
    ]);
    expect(filterExpensesByPeriod(items, "quarter", now).map((i) => i.id)).toEqual([
      "today",
      "month",
    ]);
    expect(filterExpensesByPeriod(items, "year", now).map((i) => i.id)).toEqual([
      "today",
      "month",
      "prev-quarter",
    ]);
    expect(filterExpensesByPeriod(items, "all", now)).toHaveLength(4);
  });
});
