import "server-only";

import { z } from "zod";

import {
  buildExpenseAnalytics,
  type DashboardPeriod,
  type ExpenseAnalyticsSnapshot,
  resolvePeriodStart,
} from "@/features/expenses/analytics";
import {
  formatVnd,
  getTierLabel,
  normalizeSpendingTier,
  type SpendingTierValue,
} from "@/features/expenses/format";
import {
  type GeminiParseOptions,
  parseExpensesWithGemini,
} from "@/features/expenses/gemini";
import {
  type ParsedExpenseCandidate,
  parseExpenseTextLocally,
} from "@/features/expenses/parser";
import { getServerEnv } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

export type { DashboardPeriod } from "@/features/expenses/analytics";

export interface SerializedExpense {
  readonly id: string;
  readonly batchId: string | null;
  readonly title: string;
  readonly amountVnd: number;
  readonly formattedAmount: string;
  readonly currency: string;
  readonly tier: SpendingTierValue;
  readonly tierLabel: "Must have" | "Nice to have" | "Wasted";
  readonly category: string;
  readonly aiReason: string;
  readonly spentAt: string;
  readonly createdAt: string;
}

export interface SerializedBatch {
  readonly id: string;
  readonly rawInput: string;
  readonly aiModel: string;
  readonly createdAt: string;
  readonly itemCount: number;
  readonly totalVnd: number;
  readonly totalFormatted: string;
}

export interface DashboardSnapshot {
  readonly period: DashboardPeriod;
  readonly expenses: SerializedExpense[];
  readonly analytics: ExpenseAnalyticsSnapshot;
  readonly categories: string[];
  readonly recentBatches: SerializedBatch[];
}

const candidateInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  amountVnd: z.number().int().positive().max(100_000_000_000),
  tier: z.string(),
  category: z.string().trim().min(1).max(80),
  aiReason: z.string().trim().min(1).max(500),
});

export const saveExpensesInputSchema = z.object({
  userId: z.string().optional(),
  rawInput: z.string().trim().min(1).max(4_000),
  spentAt: z.string().optional(),
  modelUsed: z.string().optional(),
  items: z.array(candidateInputSchema).optional(),
});

export const updateExpensePatchSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  amountVnd: z.number().int().positive().max(100_000_000_000).optional(),
  tier: z.enum(["MUST_HAVE", "NICE_TO_HAVE", "WASTED"]).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  aiReason: z.string().trim().min(1).max(500).optional(),
  spentAt: z.string().optional(),
});

function serializeExpenseRow(row: {
  id: string;
  batchId: string | null;
  title: string;
  amountVnd: number;
  currency: string;
  tier: SpendingTierValue;
  category: string;
  aiReason: string;
  spentAt: Date;
  createdAt: Date;
}): SerializedExpense {
  return {
    id: row.id,
    batchId: row.batchId,
    title: row.title,
    amountVnd: row.amountVnd,
    formattedAmount: formatVnd(row.amountVnd),
    currency: row.currency,
    tier: row.tier,
    tierLabel: getTierLabel(row.tier),
    category: row.category,
    aiReason: row.aiReason,
    spentAt: row.spentAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Attaches any legacy expenses created before login was enabled (userId: null)
 * to the first authenticated user who signs in.
 */
export async function claimUnownedExpenses(userId: string): Promise<void> {
  if (!userId) return;
  const prisma = getPrisma();
  const unownedCount = await prisma.expense.count({ where: { userId: null } });
  if (unownedCount === 0) return;

  await Promise.all([
    prisma.expense.updateMany({
      where: { userId: null },
      data: { userId },
    }),
    prisma.expenseInputBatch.updateMany({
      where: { userId: null },
      data: { userId },
    }),
  ]);
}

async function enrichCandidatesFromHistory(
  candidates: readonly ParsedExpenseCandidate[],
  userId?: string,
): Promise<ParsedExpenseCandidate[]> {
  if (candidates.length === 0) return [];

  try {
    const prisma = getPrisma();
    const titles = [...new Set(candidates.map((c) => c.title.trim()).filter(Boolean))];
    if (titles.length === 0) return [...candidates];

    const historicalRows = await prisma.expense.findMany({
      where: {
        ...(userId ? { userId } : {}),
        OR: titles.map((t) => ({
          title: { equals: t, mode: "insensitive" as const },
        })),
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    const historyByLowerTitle = new Map<
      string,
      { tier: SpendingTierValue; category: string; aiReason: string }
    >();
    for (const row of historicalRows) {
      const key = row.title.trim().toLowerCase();
      if (!historyByLowerTitle.has(key)) {
        historyByLowerTitle.set(key, {
          tier: row.tier,
          category: row.category,
          aiReason: row.aiReason,
        });
      }
    }

    return candidates.map((candidate) => {
      const matched = historyByLowerTitle.get(candidate.title.trim().toLowerCase());
      if (!matched) {
        return candidate;
      }
      return {
        ...candidate,
        tier: matched.tier,
        category: matched.category,
        aiReason: matched.aiReason,
        confidence: "high",
      };
    });
  } catch {
    return [...candidates];
  }
}

export async function previewExpenseParse(
  rawInput: string,
  options?: GeminiParseOptions & { userId?: string },
): Promise<{
  rawInput: string;
  items: ParsedExpenseCandidate[];
  modelUsed: string;
  usedFallback: boolean;
}> {
  const env = getServerEnv();
  const localCandidates = parseExpenseTextLocally(rawInput);
  const preEnrichedItems = await enrichCandidatesFromHistory(
    localCandidates,
    options?.userId,
  );

  return parseExpensesWithGemini(rawInput, {
    apiKeys: options?.apiKeys ?? env.geminiApiKeys,
    models: options?.models,
    fetchImpl: options?.fetchImpl,
    forceAi: options?.forceAi,
    preEnrichedItems,
  });
}

export async function parseAndSaveExpenses(
  input: z.input<typeof saveExpensesInputSchema>,
  options?: GeminiParseOptions,
): Promise<{
  batchId: string;
  modelUsed: string;
  usedFallback: boolean;
  expenses: SerializedExpense[];
}> {
  const validated = saveExpensesInputSchema.parse(input);
  const spentAtDate = validated.spentAt ? new Date(validated.spentAt) : new Date();
  const effectiveSpentAt = Number.isNaN(spentAtDate.getTime()) ? new Date() : spentAtDate;

  let itemsToSave: ParsedExpenseCandidate[];
  let modelUsed = validated.modelUsed ?? "manual-preview";
  let usedFallback = false;

  if (validated.items && validated.items.length > 0) {
    itemsToSave = validated.items.map((item) => {
      const tier = normalizeSpendingTier(item.tier);
      return {
        title: item.title,
        amountVnd: item.amountVnd,
        formattedAmount: formatVnd(item.amountVnd),
        currency: "VND",
        tier,
        category: item.category,
        aiReason: item.aiReason,
      };
    });
  } else {
    const parsed = await previewExpenseParse(validated.rawInput, {
      ...options,
      userId: validated.userId,
    });
    itemsToSave = parsed.items;
    modelUsed = parsed.modelUsed;
    usedFallback = parsed.usedFallback;
  }

  if (itemsToSave.length === 0) {
    throw new Error(
      'Could not detect any expense items with VND amounts. Try an input like: "coffee 30k, lunch 50k in VND".',
    );
  }

  const prisma = getPrisma();
  const createdBatch = await prisma.expenseInputBatch.create({
    data: {
      userId: validated.userId ?? null,
      rawInput: validated.rawInput,
      aiModel: modelUsed,
      expenses: {
        create: itemsToSave.map((item) => ({
          userId: validated.userId ?? null,
          title: item.title,
          amountVnd: item.amountVnd,
          currency: "VND",
          tier: item.tier,
          category: item.category,
          aiReason: item.aiReason,
          spentAt: effectiveSpentAt,
        })),
      },
    },
    include: {
      expenses: true,
    },
  });

  return {
    batchId: createdBatch.id,
    modelUsed,
    usedFallback,
    expenses: createdBatch.expenses.map(serializeExpenseRow),
  };
}

export async function getDashboardSnapshot(params?: {
  period?: DashboardPeriod;
  userId?: string;
}): Promise<DashboardSnapshot> {
  const period: DashboardPeriod = params?.period ?? "all";
  const userId = params?.userId;
  const startDate = resolvePeriodStart(period);
  const prisma = getPrisma();

  const expenseWhere = {
    ...(userId ? { userId } : {}),
    ...(startDate ? { spentAt: { gte: startDate } } : {}),
  };

  const [expenseRows, recentBatchRows] = await Promise.all([
    prisma.expense.findMany({
      where: Object.keys(expenseWhere).length > 0 ? expenseWhere : undefined,
      orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
      take: 500,
    }),
    prisma.expenseInputBatch.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        expenses: {
          select: { amountVnd: true },
        },
      },
    }),
  ]);

  const serializedExpenses = expenseRows.map(serializeExpenseRow);
  const analytics = buildExpenseAnalytics(expenseRows);
  const categories = [...new Set(expenseRows.map((r) => r.category))].sort();

  const recentBatches: SerializedBatch[] = recentBatchRows.map((batch) => {
    const totalVnd = batch.expenses.reduce((sum, e) => sum + e.amountVnd, 0);
    return {
      id: batch.id,
      rawInput: batch.rawInput,
      aiModel: batch.aiModel,
      createdAt: batch.createdAt.toISOString(),
      itemCount: batch.expenses.length,
      totalVnd,
      totalFormatted: formatVnd(totalVnd),
    };
  });

  return {
    period,
    expenses: serializedExpenses,
    analytics,
    categories,
    recentBatches,
  };
}

export async function updateExpenseItem(
  id: string,
  patch: z.input<typeof updateExpensePatchSchema>,
  userId?: string,
): Promise<SerializedExpense> {
  const validated = updateExpensePatchSchema.parse(patch);
  const prisma = getPrisma();

  const updated = await prisma.expense.update({
    where: {
      id,
      ...(userId ? { userId } : {}),
    },
    data: {
      ...(validated.title !== undefined && { title: validated.title }),
      ...(validated.amountVnd !== undefined && { amountVnd: validated.amountVnd }),
      ...(validated.tier !== undefined && { tier: validated.tier }),
      ...(validated.category !== undefined && { category: validated.category }),
      ...(validated.aiReason !== undefined && { aiReason: validated.aiReason }),
      ...(validated.spentAt !== undefined && { spentAt: new Date(validated.spentAt) }),
    },
  });

  return serializeExpenseRow(updated);
}

export async function deleteExpenseItem(id: string, userId?: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.expense.delete({
    where: {
      id,
      ...(userId ? { userId } : {}),
    },
  });
}
