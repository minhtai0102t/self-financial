import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildExpenseAnalytics } from "@/features/expenses/analytics";
import { ExpenseDashboard } from "@/features/expenses/expense-dashboard";
import type { DashboardSnapshot } from "@/features/expenses/service";

describe("ExpenseDashboard", () => {
  it("opens the daily log without rendering reports or the overview", () => {
    const snapshot: DashboardSnapshot = {
      period: "all",
      expenses: [],
      analytics: buildExpenseAnalytics([]),
      categories: [],
      recentBatches: [],
    };
    const html = renderToStaticMarkup(
      createElement(ExpenseDashboard, { initialSnapshot: snapshot }),
    );

    expect(html).toContain('aria-label="Expense text input"');
    expect(html).toContain('aria-label="Previous day"');
    expect(html).toContain('aria-label="Next day"');
    expect(html).not.toContain("Spend Overview");
    expect(html).not.toContain('aria-label="Spending summary metrics"');
    expect(html).not.toContain('aria-label="Reporting period"');
  });
});
