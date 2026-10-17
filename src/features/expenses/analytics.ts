import {
  formatVnd,
  getTierLabel,
  SPENDING_TIERS,
  type SpendingTierValue,
  TIER_METADATA,
} from "@/features/expenses/format";

export type DashboardPeriod =
  | "today"
  | "7d"
  | "30d"
  | "month"
  | "quarter"
  | "year"
  | "all";

export type ReportHorizon = "daily" | "monthly" | "quarterly" | "yearly";

export interface AnalyticsExpenseItem {
  readonly id: string;
  readonly title: string;
  readonly amountVnd: number;
  readonly currency: string;
  readonly tier: SpendingTierValue;
  readonly category: string;
  readonly aiReason: string;
  readonly spentAt: Date | string;
}

export interface TierBreakdownItem {
  readonly tier: SpendingTierValue;
  readonly label: "Must have" | "Nice to have" | "Wasted";
  readonly amountVnd: number;
  readonly formattedAmount: string;
  readonly count: number;
  readonly percentage: number;
  readonly recommendedMaxPct: number;
  readonly isOverRecommended: boolean;
}

export interface CategoryBreakdownItem {
  readonly category: string;
  readonly amountVnd: number;
  readonly formattedAmount: string;
  readonly count: number;
  readonly percentage: number;
  readonly dominantTier: SpendingTierValue;
}

export interface DailySpendPoint {
  readonly date: string;
  readonly totalVnd: number;
  readonly mustHaveVnd: number;
  readonly niceToHaveVnd: number;
  readonly wastedVnd: number;
  readonly count: number;
}

export interface PeriodSummaryBucket {
  readonly key: string;
  readonly label: string;
  readonly totalVnd: number;
  readonly formattedTotal: string;
  readonly mustHaveVnd: number;
  readonly niceToHaveVnd: number;
  readonly wastedVnd: number;
  readonly mustHavePct: number;
  readonly niceToHavePct: number;
  readonly wastedPct: number;
  readonly count: number;
  readonly averagePerItemVnd: number;
  readonly changePct: number | null;
}

export interface FinancialInsight {
  readonly id: string;
  readonly tone: "good" | "warning" | "danger" | "neutral";
  readonly title: string;
  readonly detail: string;
}

export interface ExpenseAnalyticsSnapshot {
  readonly totalVnd: number;
  readonly totalFormatted: string;
  readonly expenseCount: number;
  readonly averageDailyVnd: number;
  readonly averageDailyFormatted: string;
  readonly byTier: Record<SpendingTierValue, TierBreakdownItem>;
  readonly byCategory: CategoryBreakdownItem[];
  readonly dailySeries: DailySpendPoint[];
  readonly monthlySeries: PeriodSummaryBucket[];
  readonly quarterlySeries: PeriodSummaryBucket[];
  readonly yearlySeries: PeriodSummaryBucket[];
  readonly insights: FinancialInsight[];
}

const MONTH_SHORT_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function resolvePeriodStart(
  period: DashboardPeriod,
  now: Date = new Date(),
): Date | undefined {
  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === "7d") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (period === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (period === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return new Date(now.getFullYear(), quarterStartMonth, 1);
  }
  if (period === "year") {
    return new Date(now.getFullYear(), 0, 1);
  }
  return undefined;
}

export function filterExpensesByPeriod<T extends { readonly spentAt: Date | string }>(
  items: readonly T[],
  period: DashboardPeriod,
  now: Date = new Date(),
): T[] {
  const start = resolvePeriodStart(period, now);
  if (!start) {
    return [...items];
  }
  const startMs = start.getTime();
  return items.filter((item) => {
    const itemDate = item.spentAt instanceof Date ? item.spentAt : new Date(item.spentAt);
    const ms = itemDate.getTime();
    return Number.isFinite(ms) && ms >= startMs;
  });
}

function toIsoDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function roundPct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

interface RawPeriodAccumulator {
  label: string;
  totalVnd: number;
  mustHaveVnd: number;
  niceToHaveVnd: number;
  wastedVnd: number;
  count: number;
}

function finalizePeriodSeries(
  map: Map<string, RawPeriodAccumulator>,
): PeriodSummaryBucket[] {
  const sortedEntries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return sortedEntries.map(([key, bucket], idx) => {
    const prev = idx > 0 ? sortedEntries[idx - 1]?.[1] : undefined;
    const changePct =
      prev && prev.totalVnd > 0
        ? Math.round(((bucket.totalVnd - prev.totalVnd) / prev.totalVnd) * 1000) / 10
        : null;

    return {
      key,
      label: bucket.label,
      totalVnd: bucket.totalVnd,
      formattedTotal: formatVnd(bucket.totalVnd),
      mustHaveVnd: bucket.mustHaveVnd,
      niceToHaveVnd: bucket.niceToHaveVnd,
      wastedVnd: bucket.wastedVnd,
      mustHavePct: roundPct(bucket.mustHaveVnd, bucket.totalVnd),
      niceToHavePct: roundPct(bucket.niceToHaveVnd, bucket.totalVnd),
      wastedPct: roundPct(bucket.wastedVnd, bucket.totalVnd),
      count: bucket.count,
      averagePerItemVnd:
        bucket.count > 0 ? Math.round(bucket.totalVnd / bucket.count) : 0,
      changePct,
    };
  });
}

function addItemToPeriodAccumulator(
  map: Map<string, RawPeriodAccumulator>,
  key: string,
  label: string,
  item: AnalyticsExpenseItem,
): void {
  const existing = map.get(key) ?? {
    label,
    totalVnd: 0,
    mustHaveVnd: 0,
    niceToHaveVnd: 0,
    wastedVnd: 0,
    count: 0,
  };
  existing.totalVnd += item.amountVnd;
  existing.count += 1;
  if (item.tier === "MUST_HAVE") existing.mustHaveVnd += item.amountVnd;
  if (item.tier === "NICE_TO_HAVE") existing.niceToHaveVnd += item.amountVnd;
  if (item.tier === "WASTED") existing.wastedVnd += item.amountVnd;
  map.set(key, existing);
}

export function buildExpenseAnalytics(items: readonly AnalyticsExpenseItem[]): ExpenseAnalyticsSnapshot {
  const totalVnd = items.reduce((sum, item) => sum + item.amountVnd, 0);
  const expenseCount = items.length;

  const tierTotals: Record<SpendingTierValue, { amountVnd: number; count: number }> = {
    MUST_HAVE: { amountVnd: 0, count: 0 },
    NICE_TO_HAVE: { amountVnd: 0, count: 0 },
    WASTED: { amountVnd: 0, count: 0 },
  };

  const categoryMap = new Map<
    string,
    {
      amountVnd: number;
      count: number;
      tierAmounts: Record<SpendingTierValue, number>;
    }
  >();

  const dailyMap = new Map<
    string,
    {
      totalVnd: number;
      mustHaveVnd: number;
      niceToHaveVnd: number;
      wastedVnd: number;
      count: number;
    }
  >();
  const monthlyMap = new Map<string, RawPeriodAccumulator>();
  const quarterlyMap = new Map<string, RawPeriodAccumulator>();
  const yearlyMap = new Map<string, RawPeriodAccumulator>();

  for (const item of items) {
    const tierBucket = tierTotals[item.tier];
    tierBucket.amountVnd += item.amountVnd;
    tierBucket.count += 1;

    const existingCat = categoryMap.get(item.category) ?? {
      amountVnd: 0,
      count: 0,
      tierAmounts: { MUST_HAVE: 0, NICE_TO_HAVE: 0, WASTED: 0 },
    };
    existingCat.amountVnd += item.amountVnd;
    existingCat.count += 1;
    existingCat.tierAmounts[item.tier] += item.amountVnd;
    categoryMap.set(item.category, existingCat);

    const dateKey = toIsoDateKey(item.spentAt);
    const existingDay = dailyMap.get(dateKey) ?? {
      totalVnd: 0,
      mustHaveVnd: 0,
      niceToHaveVnd: 0,
      wastedVnd: 0,
      count: 0,
    };
    existingDay.totalVnd += item.amountVnd;
    existingDay.count += 1;
    if (item.tier === "MUST_HAVE") existingDay.mustHaveVnd += item.amountVnd;
    if (item.tier === "NICE_TO_HAVE") existingDay.niceToHaveVnd += item.amountVnd;
    if (item.tier === "WASTED") existingDay.wastedVnd += item.amountVnd;
    dailyMap.set(dateKey, existingDay);

    const yearStr = dateKey.slice(0, 4);
    const monthStr = dateKey.slice(5, 7);
    const monthNum = Math.max(1, Math.min(12, Number(monthStr) || 1));
    const quarterNum = Math.floor((monthNum - 1) / 3) + 1;

    const monthKey = `${yearStr}-${monthStr}`;
    const monthLabel = `${MONTH_SHORT_NAMES[monthNum - 1]} ${yearStr}`;
    addItemToPeriodAccumulator(monthlyMap, monthKey, monthLabel, item);

    const quarterKey = `${yearStr}-Q${quarterNum}`;
    const quarterLabel = `Q${quarterNum} ${yearStr}`;
    addItemToPeriodAccumulator(quarterlyMap, quarterKey, quarterLabel, item);

    addItemToPeriodAccumulator(yearlyMap, yearStr, yearStr, item);
  }

  const byTier = {} as Record<SpendingTierValue, TierBreakdownItem>;
  for (const tier of SPENDING_TIERS) {
    const meta = TIER_METADATA[tier];
    const bucket = tierTotals[tier];
    const percentage = roundPct(bucket.amountVnd, totalVnd);
    byTier[tier] = {
      tier,
      label: getTierLabel(tier),
      amountVnd: bucket.amountVnd,
      formattedAmount: formatVnd(bucket.amountVnd),
      count: bucket.count,
      percentage,
      recommendedMaxPct: meta.recommendedMaxSharePct,
      isOverRecommended: totalVnd > 0 && percentage > meta.recommendedMaxSharePct,
    };
  }

  const byCategory: CategoryBreakdownItem[] = [...categoryMap.entries()]
    .map(([category, data]) => {
      let dominantTier: SpendingTierValue = "MUST_HAVE";
      if (data.tierAmounts.NICE_TO_HAVE > data.tierAmounts[dominantTier]) {
        dominantTier = "NICE_TO_HAVE";
      }
      if (data.tierAmounts.WASTED > data.tierAmounts[dominantTier]) {
        dominantTier = "WASTED";
      }
      return {
        category,
        amountVnd: data.amountVnd,
        formattedAmount: formatVnd(data.amountVnd),
        count: data.count,
        percentage: roundPct(data.amountVnd, totalVnd),
        dominantTier,
      };
    })
    .sort((a, b) => b.amountVnd - a.amountVnd);

  const dailySeries: DailySpendPoint[] = [...dailyMap.entries()]
    .map(([date, data]) => ({
      date,
      ...data,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const monthlySeries = finalizePeriodSeries(monthlyMap);
  const quarterlySeries = finalizePeriodSeries(quarterlyMap);
  const yearlySeries = finalizePeriodSeries(yearlyMap);

  const activeDays = Math.max(1, dailySeries.length);
  const averageDailyVnd = expenseCount > 0 ? Math.round(totalVnd / activeDays) : 0;

  const insights: FinancialInsight[] = [];

  if (expenseCount === 0) {
    insights.push({
      id: "empty-state",
      tone: "neutral",
      title: "Ready to analyze your spending",
      detail: 'Enter an expense like "coffee 30k, lunch 50k in VND" above to see AI categorization and reports.',
    });
  } else {
    const wastedTier = byTier.WASTED;
    const niceTier = byTier.NICE_TO_HAVE;
    const mustTier = byTier.MUST_HAVE;

    if (wastedTier.percentage > 10) {
      const topWasted = items
        .filter((i) => i.tier === "WASTED")
        .sort((a, b) => b.amountVnd - a.amountVnd)[0];
      insights.push({
        id: "wasted-alert",
        tone: "danger",
        title: `Wasted spending is ${wastedTier.percentage}% of total (${wastedTier.formattedAmount})`,
        detail: topWasted
          ? `Above the 10% benchmark. Largest wasted item: "${topWasted.title}" (${formatVnd(topWasted.amountVnd)}). Cutting wasted items saves ${wastedTier.formattedAmount}.`
          : `Above the recommended 10% threshold. Eliminating wasted expenses saves ${wastedTier.formattedAmount}.`,
      });
    } else if (wastedTier.amountVnd === 0) {
      insights.push({
        id: "zero-wasted",
        tone: "good",
        title: "Zero wasted spending recorded",
        detail: "Every logged expense falls into Must have or Nice to have.",
      });
    } else {
      insights.push({
        id: "low-wasted",
        tone: "good",
        title: `Wasted spending is well controlled at ${wastedTier.percentage}%`,
        detail: `Within the <=10% target (${wastedTier.formattedAmount} across ${wastedTier.count} item(s)).`,
      });
    }

    if (niceTier.percentage > 35) {
      insights.push({
        id: "nice-to-have-high",
        tone: "warning",
        title: `Nice-to-have lifestyle spend is ${niceTier.percentage}% (${niceTier.formattedAmount})`,
        detail: "Consider trimming 15-20% of discretionary treats/subscriptions to boost savings.",
      });
    } else {
      insights.push({
        id: "must-vs-nice-balance",
        tone: "neutral",
        title: `Core vs Lifestyle split: ${mustTier.percentage}% Must have / ${niceTier.percentage}% Nice to have`,
        detail: `Essential costs total ${mustTier.formattedAmount} and lifestyle treats total ${niceTier.formattedAmount}.`,
      });
    }
  }

  return {
    totalVnd,
    totalFormatted: formatVnd(totalVnd),
    expenseCount,
    averageDailyVnd,
    averageDailyFormatted: formatVnd(averageDailyVnd),
    byTier,
    byCategory,
    dailySeries,
    monthlySeries,
    quarterlySeries,
    yearlySeries,
    insights,
  };
}
