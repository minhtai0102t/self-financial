import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpendReportPanel } from "@/features/expenses/spend-report-panel";

describe("SpendReportPanel", () => {
  it("defaults to the current month rather than all historical spending", () => {
    const expenses = [
      { id: "old", amountVnd: 80_000, spentAt: new Date(2026, 9, 15, 12) },
      { id: "current", amountVnd: 30_000, spentAt: new Date(2026, 10, 8, 12) },
    ].map((item) => ({
      ...item,
      title: "Lunch",
      tier: "MUST_HAVE" as const,
      currency: "VND",
      category: "Food & Drink",
      aiReason: "Meal",
    }));
    const props = {
      expenses,
      today: "2026-11-08",
    };
    const html = renderToStaticMarkup(createElement(SpendReportPanel, props));

    expect(html).toMatch(/data-testid="report-total"[^>]*>30\.000 VND</);
    expect(html).toContain(">Week</button>");
    expect(html).not.toContain(">Quarterly</button>");
    expect(html).not.toContain(">Daily</button>");
  });
});
