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
import {
  enrichCandidatesFromExpenses,
  isHighConfidenceLocalParse,
  type ParsedExpenseCandidate,
  parseExpenseTextLocally,
} from "@/features/expenses/parser";
import type {
  DashboardSnapshot,
  SerializedBatch,
  SerializedExpense,
} from "@/features/expenses/service";

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
  recentBatches: SerializedBatch[] = snapshot.recentBatches,
): DashboardSnapshot {
  const sorted = [...expenses].sort(
    (a, b) => b.spentAt.localeCompare(a.spentAt) || b.createdAt.localeCompare(a.createdAt),
  );
  return {
    ...snapshot,
    expenses: sorted,
    analytics: buildExpenseAnalytics(sorted),
    categories: [...new Set(sorted.map((e) => e.category))].sort(),
    recentBatches,
  };
}

export function buildOptimisticExpensesFromInput(params: {
  rawInput: string;
  spentAtIso: string;
  previewItems?: readonly ParsedExpenseCandidate[] | null;
  previewModel?: string | null;
  existingExpenses?: readonly SerializedExpense[];
  nowIso?: string;
  idPrefix?: string;
}): {
  batchId: string;
  candidates: ParsedExpenseCandidate[];
  optimisticExpenses: SerializedExpense[];
  isHighConfidence: boolean;
  modelUsed: string;
} {
  const trimmed = params.rawInput.trim();
  const nowIso = params.nowIso ?? new Date().toISOString();
  const prefix = params.idPrefix ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const batchId = `optimistic-batch-${prefix}`;

  let candidates: ParsedExpenseCandidate[];
  let isHighConfidence = false;
  let modelUsed = "smart-local-rules";

  if (params.previewItems && params.previewItems.length > 0) {
    candidates = [...params.previewItems];
    isHighConfidence = true;
    modelUsed = params.previewModel ?? "manual-preview";
  } else {
    const cachedPreview = readCachedParsePreview(trimmed);
    if (cachedPreview && cachedPreview.items.length > 0) {
      candidates = [...cachedPreview.items];
      isHighConfidence = true;
      modelUsed = cachedPreview.modelUsed;
    } else {
      const localParsed = parseExpenseTextLocally(trimmed);
      candidates = enrichCandidatesFromExpenses(
        localParsed,
        params.existingExpenses ?? [],
      );
      isHighConfidence = isHighConfidenceLocalParse(trimmed, candidates);
      modelUsed = isHighConfidence ? "smart-local-rules" : "optimistic-local";
    }
  }

  const optimisticExpenses: SerializedExpense[] = candidates.map((item, idx) => ({
    id: `optimistic-exp-${prefix}-${idx}`,
    batchId,
    title: item.title,
    amountVnd: item.amountVnd,
    formattedAmount: formatVnd(item.amountVnd),
    currency: "VND",
    tier: item.tier,
    tierLabel: getTierLabel(item.tier),
    category: item.category,
    aiReason: item.aiReason,
    spentAt: params.spentAtIso,
    createdAt: nowIso,
  }));

  return {
    batchId,
    candidates,
    optimisticExpenses,
    isHighConfidence,
    modelUsed,
  };
}

export function applyOptimisticExpenseCreate(
  snapshot: DashboardSnapshot,
  newExpenses: readonly SerializedExpense[],
  batchMeta?: {
    id: string;
    rawInput: string;
    aiModel: string;
    createdAt?: string;
  },
): DashboardSnapshot {
  if (newExpenses.length === 0) return snapshot;

  const nextExpenses = [...newExpenses, ...snapshot.expenses];
  let nextBatches = snapshot.recentBatches;

  if (batchMeta) {
    const totalVnd = newExpenses.reduce((sum, e) => sum + e.amountVnd, 0);
    const createdBatch: SerializedBatch = {
      id: batchMeta.id,
      rawInput: batchMeta.rawInput,
      aiModel: batchMeta.aiModel,
      createdAt: batchMeta.createdAt ?? new Date().toISOString(),
      itemCount: newExpenses.length,
      totalVnd,
      totalFormatted: formatVnd(totalVnd),
    };
    nextBatches = [
      createdBatch,
      ...snapshot.recentBatches.filter((b) => b.id !== batchMeta.id),
    ].slice(0, 8);
  }

  return rebuildSnapshotWithExpenses(snapshot, nextExpenses, nextBatches);
}

export function reconcileOptimisticExpenseCreate(
  snapshot: DashboardSnapshot,
  optimisticIds: readonly string[],
  savedExpenses: readonly SerializedExpense[],
  savedBatch?: SerializedBatch,
  optimisticBatchId?: string,
): DashboardSnapshot {
  const idSet = new Set(optimisticIds);
  const withoutOptimistic = snapshot.expenses.filter((item) => !idSet.has(item.id));
  const nextExpenses = [...savedExpenses, ...withoutOptimistic];

  let nextBatches = snapshot.recentBatches;
  if (savedBatch) {
    const filteredBatches = snapshot.recentBatches.filter(
      (b) => b.id !== optimisticBatchId && b.id !== savedBatch.id,
    );
    nextBatches = [savedBatch, ...filteredBatches].slice(0, 8);
  }

  return rebuildSnapshotWithExpenses(snapshot, nextExpenses, nextBatches);
}

export function rollbackOptimisticExpenseCreate(
  snapshot: DashboardSnapshot,
  optimisticIds: readonly string[],
  optimisticBatchId?: string,
): DashboardSnapshot {
  const idSet = new Set(optimisticIds);
  const nextExpenses = snapshot.expenses.filter((item) => !idSet.has(item.id));
  const nextBatches = optimisticBatchId
    ? snapshot.recentBatches.filter((b) => b.id !== optimisticBatchId)
    : snapshot.recentBatches;

  return rebuildSnapshotWithExpenses(snapshot, nextExpenses, nextBatches);
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
