"use client";

import { gsap } from "gsap";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  type AnalyticsExpenseItem,
  buildExpenseAnalytics,
  filterExpensesByReportPeriod,
  getReportPeriodKey,
  getReportPeriodLabel,
  type ReportHorizon,
} from "@/features/expenses/analytics";
import { SPENDING_TIERS } from "@/features/expenses/format";

interface SpendReportPanelProps {
  readonly expenses: readonly AnalyticsExpenseItem[];
  readonly today: string;
  readonly onPeriodChange?: () => void;
}

const HORIZON_OPTIONS: ReadonlyArray<{
  value: ReportHorizon;
  label: string;
  unit: string;
}> = [
  { value: "weekly", label: "Week", unit: "week" },
  { value: "monthly", label: "Month", unit: "month" },
  { value: "yearly", label: "Year", unit: "year" },
];

export function SpendReportPanel({ expenses, today, onPeriodChange }: SpendReportPanelProps) {
  const [horizon, setHorizon] = useState<ReportHorizon>("monthly");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const currentKey = today
    ? getReportPeriodKey(horizon, new Date(`${today}T12:00:00`))
    : "";
  const activeKey = selectedKey ?? currentKey;
  const horizonMeta = HORIZON_OPTIONS.find((option) => option.value === horizon)!;

  const analytics = useMemo(() => buildExpenseAnalytics(expenses), [expenses]);
  const selectedAnalytics = useMemo(
    () => buildExpenseAnalytics(filterExpensesByReportPeriod(expenses, horizon, activeKey)),
    [expenses, horizon, activeKey],
  );
  const series = horizon === "weekly" ? analytics.weeklySeries
    : horizon === "yearly" ? analytics.yearlySeries : analytics.monthlySeries;
  const history = [...series].slice(-12).reverse();

  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(contentRef.current, { opacity: 0, y: 6 }, {
        opacity: 1, y: 0, duration: 0.2, ease: "power2.out",
        clearProps: "opacity,transform",
      });
    });
    return () => media.revert();
  }, [horizon, activeKey]);

  function movePeriod(direction: number) {
    const suffix = horizon === "yearly" ? "-01-01" : horizon === "monthly" ? "-01" : "";
    const date = new Date(`${activeKey}${suffix}T12:00:00`);
    if (horizon === "yearly") date.setFullYear(date.getFullYear() + direction);
    else if (horizon === "monthly") date.setMonth(date.getMonth() + direction);
    else date.setDate(date.getDate() + direction * 7);
    selectPeriod(getReportPeriodKey(horizon, date));
  }

  function selectPeriod(key: string | null) {
    setSelectedKey(key);
    onPeriodChange?.();
  }

  return (
    <section aria-label="Spending reports" className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-medium tracking-tight sm:text-2xl">Reports</h2>
        <div role="group" aria-label="Report period" className="flex gap-1 rounded-lg bg-zinc-50 p-1">
          {HORIZON_OPTIONS.map((option) => (
            <button key={option.value} type="button" aria-pressed={horizon === option.value}
              onClick={() => { setHorizon(option.value); selectPeriod(null); }}
              className={`min-h-10 rounded-md px-4 text-sm transition-colors ${
                horizon === option.value ? "bg-white font-medium shadow-2xs" : "text-zinc-400 hover:text-zinc-700"
              }`}>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={contentRef} className="space-y-8">
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 data-testid="report-period-label" className="text-sm text-zinc-500">
                {activeKey ? getReportPeriodLabel(horizon, activeKey) : "Loading..."}
              </h3>
              {horizon === "weekly" && <p className="mt-1 text-xs text-zinc-400">Monday - Sunday</p>}
            </div>
            <div className="flex items-center gap-1">
              {activeKey && activeKey !== currentKey && (
                <button type="button" onClick={() => selectPeriod(null)}
                  className="min-h-11 px-2 text-xs text-zinc-500 hover:text-zinc-900">
                  This {horizonMeta.unit}
                </button>
              )}
              <button type="button" aria-label={`Previous ${horizonMeta.unit}`} disabled={!activeKey}
                onClick={() => movePeriod(-1)}
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-zinc-50 disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" aria-label={`Next ${horizonMeta.unit}`} disabled={!activeKey}
                onClick={() => movePeriod(1)}
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-zinc-50 disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div>
            <p data-testid="report-total" className="font-mono text-3xl font-medium tracking-tight sm:text-4xl">
              {selectedAnalytics.totalFormatted}
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Total spent / {selectedAnalytics.expenseCount} expense(s)
            </p>
          </div>
        </div>

        {selectedAnalytics.expenseCount > 0 && (
          <details key={`${horizon}-${activeKey}`} className="border-t border-zinc-100 pt-4">
            <summary className="w-fit cursor-pointer text-xs text-zinc-400 hover:text-zinc-700">Details</summary>
            <div className="mt-6 space-y-6">
              <div>
                <h4 className="mb-3 text-xs font-medium text-zinc-500">Value allocation</h4>
                <dl className="space-y-3 text-sm">
                  {SPENDING_TIERS.map((tier) => {
                    const allocation = selectedAnalytics.byTier[tier];
                    return (
                      <div key={tier} className="flex items-baseline justify-between gap-4">
                        <dt className="text-zinc-500">{allocation.label}</dt>
                        <dd className="text-right font-mono">
                          {allocation.formattedAmount} <span className="ml-2 text-xs text-zinc-400">{allocation.percentage}%</span>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
              <div>
                <h4 className="mb-3 text-xs font-medium text-zinc-500">Categories</h4>
                <dl className="space-y-3 text-sm">
                  {selectedAnalytics.byCategory.map((category) => (
                    <div key={category.category} className="flex items-baseline justify-between gap-4">
                      <dt className="text-zinc-500">{category.category}</dt>
                      <dd className="text-right font-mono">{category.formattedAmount}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-zinc-500">Insights</h4>
                {selectedAnalytics.insights.map((insight) => (
                  <div key={insight.id} className="text-xs leading-relaxed">
                    <p className={insight.tone === "danger" ? "text-rose-600" : "text-zinc-600"}>{insight.title}</p>
                    <p className="mt-1 text-zinc-400">{insight.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </details>
        )}

        <div className="border-t border-zinc-100 pt-6">
          <h3 className="mb-2 text-xs text-zinc-400">History / {horizonMeta.label}</h3>
          {history.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Reports appear after you log an expense.</p>
          ) : (
            <div data-testid="report-history" className="divide-y divide-zinc-100">
              {history.map((bucket) => (
                <button key={bucket.key} type="button" aria-pressed={activeKey === bucket.key}
                  onClick={() => selectPeriod(bucket.key)}
                  className="flex min-h-16 w-full items-center justify-between gap-4 py-4 text-left hover:bg-zinc-50/60">
                  <div className="min-w-0">
                    <p className={`text-sm ${activeKey === bucket.key ? "font-medium" : "text-zinc-500"}`}>{bucket.label}</p>
                    <p className="mt-1 text-xs text-zinc-400">{bucket.count} expense(s)</p>
                  </div>
                  <p className="shrink-0 font-mono text-sm">{bucket.formattedTotal}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
