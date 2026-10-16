import {
  formatVnd,
  getTierLabel,
  SPENDING_TIERS,
  type SpendingTierValue,
  TIER_METADATA,
} from "@/features/expenses/format";

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
  readonly insights: FinancialInsight[];
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
    insights,
  };
}
