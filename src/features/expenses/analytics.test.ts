import { describe, expect, it } from "vitest";

import { buildExpenseAnalytics } from "@/features/expenses/analytics";

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
});
