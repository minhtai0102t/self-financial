export type SpendingTierValue = "MUST_HAVE" | "NICE_TO_HAVE" | "WASTED";

export const SPENDING_TIERS: readonly SpendingTierValue[] = [
  "MUST_HAVE",
  "NICE_TO_HAVE",
  "WASTED",
] as const;

export const EXPENSE_CATEGORIES = [
  "Food & Drink",
  "Transport",
  "Bills & Utilities",
  "Housing",
  "Shopping",
  "Entertainment",
  "Health",
  "Education",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number] | string;

export interface TierMetadata {
  readonly value: SpendingTierValue;
  readonly label: "Must have" | "Nice to have" | "Wasted";
  readonly description: string;
  readonly recommendedMaxSharePct: number;
}

export const TIER_METADATA: Record<SpendingTierValue, TierMetadata> = {
  MUST_HAVE: {
    value: "MUST_HAVE",
    label: "Must have",
    description: "Essential meals, groceries, utilities, housing, commute, and healthcare.",
    recommendedMaxSharePct: 60,
  },
  NICE_TO_HAVE: {
    value: "NICE_TO_HAVE",
    label: "Nice to have",
    description: "Coffee, snacks, hobbies, social dining, books, and quality-of-life treats.",
    recommendedMaxSharePct: 30,
  },
  WASTED: {
    value: "WASTED",
    label: "Wasted",
    description: "Impulse buys, unused subscriptions, preventable fees, and regretful spending.",
    recommendedMaxSharePct: 10,
  },
};

/**
 * Formats an integer amount in VND with dot thousands separators (e.g. 30000 -> "30.000 VND").
 */
export function formatVnd(amountVnd: number): string {
  const rounded = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const sign = rounded < 0 ? "-" : "";
  const absStr = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${absStr} VND`;
}

/**
 * Compact VND label for dense chart axes (e.g. 30000 -> "30k", 1500000 -> "1.5tr").
 */
export function formatCompactVnd(amountVnd: number): string {
  const abs = Math.abs(amountVnd);
  if (abs >= 1_000_000) {
    const tr = (amountVnd / 1_000_000).toFixed(1).replace(/\.0$/, "");
    return `${tr}tr`;
  }
  if (abs >= 1_000) {
    const k = Math.round(amountVnd / 1_000);
    return `${k}k`;
  }
  return `${amountVnd}`;
}

export function getTierLabel(tier: SpendingTierValue): "Must have" | "Nice to have" | "Wasted" {
  return TIER_METADATA[tier].label;
}

export function normalizeSpendingTier(raw: string): SpendingTierValue {
  const cleaned = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (cleaned === "MUST_HAVE" || cleaned === "MUST" || cleaned === "ESSENTIAL" || cleaned === "NEED") {
    return "MUST_HAVE";
  }
  if (cleaned === "WASTED" || cleaned === "WASTE" || cleaned === "IMPULSE" || cleaned === "UNNECESSARY") {
    return "WASTED";
  }
  return "NICE_TO_HAVE";
}
