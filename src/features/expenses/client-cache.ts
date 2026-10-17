import {
  buildExpenseAnalytics,
  type DashboardPeriod,
  filterExpensesByPeriod,
} from "@/features/expenses/analytics";
import {
  formatVnd,
  getTierLabel,
  type SpendingTierValue,
} from "@/features/expenses/format";
import type { ParsedExpenseCandidate } from "@/features/expenses/parser";
import type { DashboardSnapshot, SerializedExpense } from "@/features/expenses/service";

const SNAPSHOT_STORAGE_PREFIX = "sf_snapshot_cache_v1";
const PREVIEW_STORAGE_PREFIX = "sf_parse_preview_v1";
export const DEFAULT_SNAPSHOT_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedSnapshotEntry {
  readonly snapshot: DashboardSnapshot;
  readonly updatedAt: number;
}

interface CachedPreviewEntry {
  readonly items: ParsedExpenseCandidate[];
  readonly modelUsed: string;
  readonly updatedAt: number;
}

const memorySnapshotCache = new Map<string, CachedSnapshotEntry>();
const memoryPreviewCache = new Map<string, CachedPreviewEntry>();

function makeSnapshotKey(userKey: string, period: DashboardPeriod): string {
  const normalizedUser = (userKey || "anonymous").trim().toLowerCase();
  return `${SNAPSHOT_STORAGE_PREFIX}:${normalizedUser}:${period}`;
}

function makePreviewKey(rawInput: string): string {
  return `${PREVIEW_STORAGE_PREFIX}:${rawInput.trim().toLowerCase()}`;
}

function getSafeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function deriveSnapshotForPeriod(
  baseSnapshot: DashboardSnapshot,
  period: DashboardPeriod,
  now: Date = new Date(),
): DashboardSnapshot {
  if (baseSnapshot.period === period && period === "all") {
    return baseSnapshot;
  }

  const filteredExpenses = filterExpensesByPeriod(baseSnapshot.expenses, period, now);
  const analytics = buildExpenseAnalytics(filteredExpenses);
  const categories = [...new Set(filteredExpenses.map((e) => e.category))].sort();

  return {
    period,
    expenses: filteredExpenses,
    analytics,
    categories,
    recentBatches: baseSnapshot.recentBatches,
  };
}

export function rebuildSnapshotWithExpenses(
  snapshot: DashboardSnapshot,
  expenses: SerializedExpense[],
): DashboardSnapshot {
  const sorted = [...expenses].sort((a, b) => b.spentAt.localeCompare(a.spentAt));
  return {
    ...snapshot,
    expenses: sorted,
    analytics: buildExpenseAnalytics(sorted),
    categories: [...new Set(sorted.map((e) => e.category))].sort(),
  };
}

export function applyOptimisticExpensePatch(
  snapshot: DashboardSnapshot,
  expenseId: string,
  patch: Partial<{
    title: string;
    amountVnd: number;
    category: string;
    tier: SpendingTierValue;
    aiReason: string;
    spentAt: string;
  }>,
): DashboardSnapshot {
  const nextExpenses = snapshot.expenses.map((item) => {
    if (item.id !== expenseId) return item;
    const nextAmount = patch.amountVnd !== undefined ? patch.amountVnd : item.amountVnd;
    const nextTier = patch.tier !== undefined ? patch.tier : item.tier;
    return {
      ...item,
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.category !== undefined && { category: patch.category }),
      ...(patch.aiReason !== undefined && { aiReason: patch.aiReason }),
      ...(patch.spentAt !== undefined && { spentAt: patch.spentAt }),
      amountVnd: nextAmount,
      formattedAmount: formatVnd(nextAmount),
      tier: nextTier,
      tierLabel: getTierLabel(nextTier),
    };
  });

  return rebuildSnapshotWithExpenses(snapshot, nextExpenses);
}

export function applyOptimisticExpenseDelete(
  snapshot: DashboardSnapshot,
  expenseId: string,
): DashboardSnapshot {
  const nextExpenses = snapshot.expenses.filter((item) => item.id !== expenseId);
  return rebuildSnapshotWithExpenses(snapshot, nextExpenses);
}

export function writeCachedSnapshot(
  userKey: string,
  snapshot: DashboardSnapshot,
  nowMs: number = Date.now(),
): void {
  const key = makeSnapshotKey(userKey, snapshot.period);
  const entry: CachedSnapshotEntry = {
    snapshot,
    updatedAt: nowMs,
  };
  memorySnapshotCache.set(key, entry);

  const storage = getSafeStorage();
  if (storage) {
    try {
      storage.setItem(key, JSON.stringify(entry));
    } catch {
      // Ignore storage quota errors
    }
  }
}

export function readCachedSnapshot(
  userKey: string,
  period: DashboardPeriod = "all",
  nowMs: number = Date.now(),
  ttlMs: number = DEFAULT_SNAPSHOT_TTL_MS,
): {
  snapshot: DashboardSnapshot;
  isStale: boolean;
  updatedAt: number;
} | null {
  const exactKey = makeSnapshotKey(userKey, period);
  let entry = memorySnapshotCache.get(exactKey);

  if (!entry) {
    const storage = getSafeStorage();
    if (storage) {
      try {
        const raw = storage.getItem(exactKey);
        if (raw) {
          const parsed = JSON.parse(raw) as CachedSnapshotEntry;
          if (parsed && parsed.snapshot && Array.isArray(parsed.snapshot.expenses)) {
            entry = parsed;
            memorySnapshotCache.set(exactKey, parsed);
          }
        }
      } catch {
        // Ignore malformed localStorage entry
      }
    }
  }

  if (entry) {
    return {
      snapshot: entry.snapshot,
      isStale: nowMs - entry.updatedAt > ttlMs,
      updatedAt: entry.updatedAt,
    };
  }

  // Fallback: if a specific period was requested and we have an "all" snapshot cached, derive it immediately
  if (period !== "all") {
    const allCached = readCachedSnapshot(userKey, "all", nowMs, ttlMs);
    if (allCached) {
      const derived = deriveSnapshotForPeriod(allCached.snapshot, period);
      return {
        snapshot: derived,
        isStale: allCached.isStale,
        updatedAt: allCached.updatedAt,
      };
    }
  }

  return null;
}

export function writeCachedParsePreview(
  rawInput: string,
  payload: { items: ParsedExpenseCandidate[]; modelUsed: string },
  nowMs: number = Date.now(),
): void {
  const trimmed = rawInput.trim();
  if (!trimmed) return;
  const key = makePreviewKey(trimmed);
  const entry: CachedPreviewEntry = {
    items: payload.items,
    modelUsed: payload.modelUsed,
    updatedAt: nowMs,
  };
  memoryPreviewCache.set(key, entry);
}

export function readCachedParsePreview(
  rawInput: string,
): { items: ParsedExpenseCandidate[]; modelUsed: string } | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;
  const key = makePreviewKey(trimmed);
  const entry = memoryPreviewCache.get(key);
  if (!entry) return null;
  return {
    items: entry.items,
    modelUsed: entry.modelUsed,
  };
}

export function clearCachedSnapshots(): void {
  memorySnapshotCache.clear();
  memoryPreviewCache.clear();
  const storage = getSafeStorage();
  if (storage) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (
          k &&
          (k.startsWith(SNAPSHOT_STORAGE_PREFIX) || k.startsWith(PREVIEW_STORAGE_PREFIX))
        ) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        storage.removeItem(k);
      }
    } catch {
      // Ignore storage errors
    }
  }
}
