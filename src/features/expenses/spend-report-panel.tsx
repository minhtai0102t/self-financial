"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  ExpenseAnalyticsSnapshot,
  PeriodSummaryBucket,
  ReportHorizon,
} from "@/features/expenses/analytics";
import {
  formatCompactVnd,
  formatVnd,
  getTierLabel,
  SPENDING_TIERS,
  type SpendingTierValue,
} from "@/features/expenses/format";

interface SpendReportPanelProps {
  readonly analytics: ExpenseAnalyticsSnapshot;
}

const HORIZON_OPTIONS: ReadonlyArray<{
  readonly value: ReportHorizon;
  readonly label: string;
  readonly unitLabel: string;
}> = [
  { value: "monthly", label: "Monthly", unitLabel: "month" },
  { value: "quarterly", label: "Quarterly", unitLabel: "quarter" },
  { value: "yearly", label: "Yearly", unitLabel: "year" },
  { value: "daily", label: "Daily", unitLabel: "day" },
];

function getTierDotClass(tier: SpendingTierValue): string {
  switch (tier) {
    case "MUST_HAVE":
      return "bg-emerald-600";
    case "NICE_TO_HAVE":
      return "bg-amber-500";
    case "WASTED":
      return "bg-rose-600";
  }
}

function getTierPillClass(tier: SpendingTierValue): string {
  switch (tier) {
    case "MUST_HAVE":
      return "text-emerald-700 bg-emerald-50 border-emerald-200/80";
    case "NICE_TO_HAVE":
      return "text-amber-700 bg-amber-50 border-amber-200/80";
    case "WASTED":
      return "text-rose-700 bg-rose-50 border-rose-200/80";
  }
}

export function SpendReportPanel({ analytics }: SpendReportPanelProps) {
  const [horizon, setHorizon] = useState<ReportHorizon>("monthly");

  const activeSeries: PeriodSummaryBucket[] = useMemo(() => {
    if (horizon === "monthly") return analytics.monthlySeries;
    if (horizon === "quarterly") return analytics.quarterlySeries;
    if (horizon === "yearly") return analytics.yearlySeries;

    // Convert dailySeries to PeriodSummaryBucket shape for unified rendering
    return analytics.dailySeries.map((day, idx, arr) => {
      const prev = idx > 0 ? arr[idx - 1] : undefined;
      const changePct =
        prev && prev.totalVnd > 0
          ? Math.round(((day.totalVnd - prev.totalVnd) / prev.totalVnd) * 1000) / 10
          : null;
      const roundPct = (part: number) =>
        day.totalVnd > 0 ? Math.round((part / day.totalVnd) * 1000) / 10 : 0;

      return {
        key: day.date,
        label: day.date,
        totalVnd: day.totalVnd,
        formattedTotal: formatVnd(day.totalVnd),
        mustHaveVnd: day.mustHaveVnd,
        niceToHaveVnd: day.niceToHaveVnd,
        wastedVnd: day.wastedVnd,
        mustHavePct: roundPct(day.mustHaveVnd),
        niceToHavePct: roundPct(day.niceToHaveVnd),
        wastedPct: roundPct(day.wastedVnd),
        count: day.count,
        averagePerItemVnd: day.count > 0 ? Math.round(day.totalVnd / day.count) : 0,
        changePct,
      };
    });
  }, [
    horizon,
    analytics.monthlySeries,
    analytics.quarterlySeries,
    analytics.yearlySeries,
    analytics.dailySeries,
  ]);

  const summaryStats = useMemo(() => {
    if (activeSeries.length === 0) {
      return {
        latest: null,
        previous: null,
        avgPerPeriodVnd: 0,
        peak: null,
        maxTotalVnd: 1,
      };
    }
    const latest = activeSeries[activeSeries.length - 1] ?? null;
    const previous =
      activeSeries.length > 1 ? (activeSeries[activeSeries.length - 2] ?? null) : null;
    const sum = activeSeries.reduce((acc, item) => acc + item.totalVnd, 0);
    const avgPerPeriodVnd = Math.round(sum / activeSeries.length);
    const peak = activeSeries.reduce(
      (best, item) => (item.totalVnd > best.totalVnd ? item : best),
      activeSeries[0]!,
    );
    const maxTotalVnd = Math.max(1, peak.totalVnd);

    return {
      latest,
      previous,
      avgPerPeriodVnd,
      peak,
      maxTotalVnd,
    };
  }, [activeSeries]);

  const activeHorizonMeta =
    HORIZON_OPTIONS.find((opt) => opt.value === horizon) ?? HORIZON_OPTIONS[0]!;

  const displayedBuckets = useMemo(() => {
    const limit = horizon === "daily" ? 14 : 12;
    return [...activeSeries].slice(-limit).reverse();
  }, [activeSeries, horizon]);

  return (
    <div className="space-y-6">
      {/* Spend Overview Card: Monthly / Quarterly / Yearly / Daily */}
      <div className="rounded-xl border border-zinc-200/90 bg-white p-4 sm:p-5 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">
              Spend Overview &amp; Horizon Report
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Compare total spend and value allocation across months, quarters, and years.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Report time horizon"
            className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100/80 p-0.5 text-xs"
          >
            {HORIZON_OPTIONS.map((opt) => {
              const active = horizon === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setHorizon(opt.value)}
                  className={`rounded-md px-3 py-1 font-medium transition ${
                    active
                      ? "bg-white text-zinc-900 shadow-2xs"
                      : "text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Horizon Summary KPI Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-zinc-200/70 bg-zinc-50/50 p-3">
            <span className="text-[11px] text-zinc-500">
              Latest {activeHorizonMeta.unitLabel}
            </span>
            <p className="mt-1 font-mono text-sm sm:text-base font-semibold text-zinc-900 truncate">
              {summaryStats.latest ? summaryStats.latest.formattedTotal : "0 VND"}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              {summaryStats.latest
                ? `${summaryStats.latest.label} (${summaryStats.latest.count} items)`
                : "No data"}
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200/70 bg-zinc-50/50 p-3">
            <span className="text-[11px] text-zinc-500">
              vs Previous {activeHorizonMeta.unitLabel}
            </span>
            <div className="mt-1 flex items-center gap-1 font-mono text-sm sm:text-base font-semibold">
              {summaryStats.latest?.changePct === null ||
              summaryStats.latest?.changePct === undefined ? (
                <span className="inline-flex items-center gap-1 text-zinc-400">
                  <Minus className="h-3.5 w-3.5" />
                  Baseline
                </span>
              ) : summaryStats.latest.changePct > 0 ? (
                <span className="inline-flex items-center gap-0.5 text-rose-600">
                  <ArrowUpRight className="h-4 w-4" />+{summaryStats.latest.changePct}%
                </span>
              ) : summaryStats.latest.changePct < 0 ? (
                <span className="inline-flex items-center gap-0.5 text-emerald-700">
                  <ArrowDownRight className="h-4 w-4" />
                  {summaryStats.latest.changePct}%
                </span>
              ) : (
                <span className="text-zinc-600">0%</span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-400 truncate">
              {summaryStats.previous
                ? `Prev: ${summaryStats.previous.label} (${formatCompactVnd(summaryStats.previous.totalVnd)})`
                : `Single ${activeHorizonMeta.unitLabel} recorded`}
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200/70 bg-zinc-50/50 p-3">
            <span className="text-[11px] text-zinc-500">
              Avg / {activeHorizonMeta.unitLabel}
            </span>
            <p className="mt-1 font-mono text-sm sm:text-base font-semibold text-zinc-900 truncate">
              {formatVnd(summaryStats.avgPerPeriodVnd)}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Across {activeSeries.length} {activeHorizonMeta.unitLabel}
              {activeSeries.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200/70 bg-zinc-50/50 p-3">
            <span className="text-[11px] text-zinc-500">
              Peak {activeHorizonMeta.unitLabel}
            </span>
            <p className="mt-1 font-mono text-sm sm:text-base font-semibold text-zinc-900 truncate">
              {summaryStats.peak ? summaryStats.peak.formattedTotal : "0 VND"}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              {summaryStats.peak ? summaryStats.peak.label : "No data"}
            </p>
          </div>
        </div>

        {/* Period Breakdown Rows */}
        {displayedBuckets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 py-8 text-center text-xs text-zinc-400">
            No expenses recorded for this period yet.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100" data-testid="horizon-period-list">
            {displayedBuckets.map((bucket) => {
              const barScalePct = Math.max(
                4,
                Math.round((bucket.totalVnd / summaryStats.maxTotalVnd) * 100),
              );

              return (
                <div key={bucket.key} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-zinc-900">
                        {bucket.label}
                      </span>
                      <span className="text-zinc-400">
                        {bucket.count} item{bucket.count === 1 ? "" : "s"}
                      </span>
                      {bucket.changePct !== null && (
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                            bucket.changePct > 0
                              ? "bg-rose-50 text-rose-700"
                              : bucket.changePct < 0
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {bucket.changePct > 0 ? `+${bucket.changePct}%` : `${bucket.changePct}%`}
                        </span>
                      )}
                    </div>

                    <span className="font-mono font-semibold text-zinc-900">
                      {bucket.formattedTotal}
                    </span>
                  </div>

                  {/* Proportional Stacked Bar */}
                  <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      style={{ width: `${barScalePct}%` }}
                      className="flex h-full overflow-hidden rounded-full"
                    >
                      <div
                        style={{ width: `${bucket.mustHavePct}%` }}
                        className="bg-emerald-600"
                        title={`Must have: ${formatVnd(bucket.mustHaveVnd)} (${bucket.mustHavePct}%)`}
                      />
                      <div
                        style={{ width: `${bucket.niceToHavePct}%` }}
                        className="bg-amber-500"
                        title={`Nice to have: ${formatVnd(bucket.niceToHaveVnd)} (${bucket.niceToHavePct}%)`}
                      />
                      <div
                        style={{ width: `${bucket.wastedPct}%` }}
                        className="bg-rose-600"
                        title={`Wasted: ${formatVnd(bucket.wastedVnd)} (${bucket.wastedPct}%)`}
                      />
                    </div>
                  </div>

                  {/* Compact Tier Share Caption */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 font-mono">
                    <span>
                      Must: {bucket.mustHavePct}% ({formatCompactVnd(bucket.mustHaveVnd)})
                    </span>
                    <span>
                      Nice: {bucket.niceToHavePct}% ({formatCompactVnd(bucket.niceToHaveVnd)})
                    </span>
                    <span className={bucket.wastedPct > 10 ? "text-rose-600 font-medium" : ""}>
                      Wasted: {bucket.wastedPct}% ({formatCompactVnd(bucket.wastedVnd)})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom 2-Column Grid: Value Allocation & Insights + Category Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Value Ratio & Financial Insights */}
        <div className="lg:col-span-7 rounded-xl border border-zinc-200/90 bg-white p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">
              Value Allocation (60 / 30 / 10 Rule)
            </h3>
            <span className="font-mono text-xs text-zinc-400">
              Target &le;60% / &le;30% / &le;10%
            </span>
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 flex">
            {analytics.totalVnd > 0 && (
              <>
                <div
                  style={{ width: `${analytics.byTier.MUST_HAVE.percentage}%` }}
                  className="bg-emerald-600 transition-all"
                />
                <div
                  style={{ width: `${analytics.byTier.NICE_TO_HAVE.percentage}%` }}
                  className="bg-amber-500 transition-all"
                />
                <div
                  style={{ width: `${analytics.byTier.WASTED.percentage}%` }}
                  className="bg-rose-600 transition-all"
                />
              </>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-xs">
            {SPENDING_TIERS.map((tier) => {
              const info = analytics.byTier[tier];
              return (
                <div
                  key={tier}
                  className="rounded-lg border border-zinc-200/70 bg-zinc-50/40 p-2.5"
                >
                  <div className="flex items-center gap-1.5 text-zinc-600 font-medium">
                    <span className={`h-2 w-2 rounded-full ${getTierDotClass(tier)}`} />
                    <span className="truncate">{info.label}</span>
                  </div>
                  <p className="mt-1 font-mono font-semibold text-zinc-900 truncate">
                    {info.formattedAmount}
                  </p>
                  <p className="font-mono text-[11px] text-zinc-400">
                    {info.percentage}% · {info.count} items
                  </p>
                </div>
              );
            })}
          </div>

          <div className="space-y-2 pt-1">
            {analytics.insights.map((insight) => (
              <div
                key={insight.id}
                className={`rounded-lg border px-3 py-2.5 text-xs ${
                  insight.tone === "danger"
                    ? "border-rose-200/80 bg-rose-50/50 text-rose-900"
                    : insight.tone === "warning"
                      ? "border-amber-200/80 bg-amber-50/50 text-amber-900"
                      : insight.tone === "good"
                        ? "border-emerald-200/80 bg-emerald-50/50 text-emerald-900"
                        : "border-zinc-200/80 bg-zinc-50/60 text-zinc-800"
                }`}
              >
                <p className="font-medium">{insight.title}</p>
                <p className="mt-0.5 text-zinc-600">{insight.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Category Spend Breakdown */}
        <div className="lg:col-span-5 rounded-xl border border-zinc-200/90 bg-white p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">Spend by Category</h3>
            <span className="font-mono text-xs text-zinc-400">
              {analytics.byCategory.length} categories
            </span>
          </div>

          {analytics.byCategory.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-400">
              Categories appear after logging expenses.
            </p>
          ) : (
            <div className="space-y-3">
              {analytics.byCategory.map((cat) => (
                <div key={cat.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-zinc-800 truncate">
                        {cat.category}
                      </span>
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.2 text-[10px] font-medium ${getTierPillClass(
                          cat.dominantTier,
                        )}`}
                      >
                        {getTierLabel(cat.dominantTier)}
                      </span>
                    </div>
                    <span className="font-mono font-medium text-zinc-900 shrink-0">
                      {cat.formattedAmount}{" "}
                      <span className="text-zinc-400">({cat.percentage}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                      style={{ width: `${Math.max(3, cat.percentage)}%` }}
                      className={`h-full rounded-full ${getTierDotClass(cat.dominantTier)}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
