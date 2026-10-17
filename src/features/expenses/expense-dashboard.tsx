"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  Filter,
  LayoutGrid,
  LogOut,
  PlusCircle,
  ReceiptText,
  RefreshCw,
  Search,
  Share,
  Smartphone,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { signOut } from "@/features/auth/actions";
import type { DashboardPeriod } from "@/features/expenses/analytics";
import {
  applyOptimisticExpenseDelete,
  applyOptimisticExpensePatch,
  deriveSnapshotForPeriod,
  readCachedParsePreview,
  readCachedSnapshot,
  writeCachedParsePreview,
  writeCachedSnapshot,
} from "@/features/expenses/client-cache";
import {
  EXPENSE_CATEGORIES,
  formatVnd,
  getTierLabel,
  SPENDING_TIERS,
  type SpendingTierValue,
} from "@/features/expenses/format";
import type { ParsedExpenseCandidate } from "@/features/expenses/parser";
import {
  appendAmountShorthand,
  appendQuickExpenseChip,
  QUICK_AMOUNT_TOKENS,
  QUICK_EXPENSE_PRESETS,
} from "@/features/expenses/quick-input";
import type {
  DashboardSnapshot,
  SerializedExpense,
} from "@/features/expenses/service";
import { SpendReportPanel } from "@/features/expenses/spend-report-panel";

interface ExpenseDashboardProps {
  readonly initialSnapshot: DashboardSnapshot;
  readonly user?: {
    readonly name: string;
    readonly email: string;
  };
}

type ViewTab = "log" | "insights" | "ledger" | "all";

const PERIOD_OPTIONS: ReadonlyArray<{ value: DashboardPeriod; label: string }> = [
  { value: "all", label: "All" },
  { value: "year", label: "Year" },
  { value: "quarter", label: "Quarter" },
  { value: "month", label: "Month" },
  { value: "30d", label: "30D" },
  { value: "7d", label: "7D" },
  { value: "today", label: "Today" },
];

function getTierBadgeClasses(tier: SpendingTierValue): string {
  switch (tier) {
    case "MUST_HAVE":
      return "bg-emerald-50 text-emerald-800 border-emerald-200/90";
    case "NICE_TO_HAVE":
      return "bg-amber-50 text-amber-800 border-amber-200/90";
    case "WASTED":
      return "bg-rose-50 text-rose-800 border-rose-200/90";
  }
}

function subscribeStandaloneMode(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getStandaloneModeSnapshot(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const standaloneMq = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );
  return standaloneMq || iosStandalone;
}

function getStandaloneModeServerSnapshot(): boolean {
  return false;
}

export function ExpenseDashboard({ initialSnapshot, user }: ExpenseDashboardProps) {
  const userCacheKey = user?.email ?? "default-user";

  // Master "all" snapshot stored in client memory + localStorage for 0ms period switching
  const [allSnapshot, setAllSnapshot] = useState<DashboardSnapshot>(initialSnapshot);
  const [period, setPeriod] = useState<DashboardPeriod>(initialSnapshot.period);
  const [activeTab, setActiveTab] = useState<ViewTab>("all");
  const [isSyncing, setIsSyncing] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [showQuickChips, setShowQuickChips] = useState(false);

  const isStandalone = useSyncExternalStore(
    subscribeStandaloneMode,
    getStandaloneModeSnapshot,
    getStandaloneModeServerSnapshot,
  );

  // Persist initial server snapshot into client SWR cache
  useEffect(() => {
    writeCachedSnapshot(userCacheKey, initialSnapshot);
  }, [userCacheKey, initialSnapshot]);

  // Derive the active period snapshot synchronously in 0ms from cached master data
  const snapshot = useMemo(
    () => deriveSnapshotForPeriod(allSnapshot, period),
    [allSnapshot, period],
  );

  // Input & AI parsing state
  const [rawInput, setRawInput] = useState("");
  const [spentAtDate, setSpentAtDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewItems, setPreviewItems] = useState<ParsedExpenseCandidate[] | null>(
    null,
  );
  const [previewModel, setPreviewModel] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  // Ledger filtering & editing state
  const [tierFilter, setTierFilter] = useState<SpendingTierValue | "ALL">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    title: string;
    amountVnd: number;
    category: string;
    tier: SpendingTierValue;
  } | null>(null);
  const [busyExpenseId, setBusyExpenseId] = useState<string | null>(null);

  async function revalidateFromServer() {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/expenses?period=all");
      const data = (await response.json()) as DashboardSnapshot & { error?: string };
      if (response.ok && data.expenses) {
        setAllSnapshot(data);
        writeCachedSnapshot(userCacheKey, data);
      }
    } catch {
      // Keep cached client state if offline
    } finally {
      setIsSyncing(false);
    }
  }

  function handlePeriodChange(nextPeriod: DashboardPeriod) {
    // 1. Instant 0ms UI update from client-side derived cache
    setPeriod(nextPeriod);

    // 2. If cached master snapshot is stale, revalidate quietly in background
    const cached = readCachedSnapshot(userCacheKey, "all");
    if (!cached || cached.isStale) {
      void revalidateFromServer();
    }
  }

  async function handlePreviewParse() {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      setFeedback({
        tone: "error",
        message: 'Enter spending text first, e.g. "coffee 30k, lunch 50k".',
      });
      return;
    }

    // Check client-side parse preview cache first for instant 0ms response
    const cachedPreview = readCachedParsePreview(trimmed);
    if (cachedPreview) {
      setPreviewItems(cachedPreview.items);
      setPreviewModel(`${cachedPreview.modelUsed} (cached)`);
      return;
    }

    setIsParsing(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/expenses/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: trimmed }),
      });
      const data = (await response.json()) as {
        items?: ParsedExpenseCandidate[];
        modelUsed?: string;
        error?: string;
      };

      if (!response.ok || !data.items) {
        setFeedback({
          tone: "error",
          message: data.error ?? "Failed to parse expenses.",
        });
        return;
      }

      const modelUsed = data.modelUsed ?? "gemini";
      setPreviewItems(data.items);
      setPreviewModel(modelUsed);
      writeCachedParsePreview(trimmed, { items: data.items, modelUsed });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to reach AI parser.",
      });
    } finally {
      setIsParsing(false);
    }
  }

  async function handleDirectParseAndSave(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = rawInput.trim();
    if (!trimmed) {
      setFeedback({
        tone: "error",
        message: 'Enter spending text first, e.g. "coffee 30k, lunch 50k".',
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput: trimmed,
          spentAt: spentAtDate
            ? new Date(`${spentAtDate}T12:00:00`).toISOString()
            : undefined,
          ...(previewItems && previewItems.length > 0
            ? { items: previewItems, modelUsed: previewModel ?? undefined }
            : {}),
        }),
      });

      const data = (await response.json()) as {
        expenses?: SerializedExpense[];
        modelUsed?: string;
        snapshot?: DashboardSnapshot;
        error?: string;
      };

      if (!response.ok || !data.snapshot) {
        setFeedback({
          tone: "error",
          message: data.error ?? "Failed to save expenses.",
        });
        return;
      }

      setAllSnapshot(data.snapshot);
      writeCachedSnapshot(userCacheKey, data.snapshot);
      setRawInput("");
      setPreviewItems(null);
      setPreviewModel(null);

      const summaryList = (data.expenses ?? [])
        .map((item) => `${item.title}: ${item.formattedAmount} (${item.tierLabel})`)
        .join(" · ");

      setFeedback({
        tone: "success",
        message: `Logged ${data.expenses?.length ?? 0} item(s): ${summaryList}`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save expenses.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function updatePreviewCandidate(
    index: number,
    patch: Partial<ParsedExpenseCandidate>,
  ) {
    if (!previewItems) return;
    const next = previewItems.map((item, idx) => {
      if (idx !== index) return item;
      const updatedAmount =
        patch.amountVnd !== undefined ? patch.amountVnd : item.amountVnd;
      return {
        ...item,
        ...patch,
        amountVnd: updatedAmount,
        formattedAmount: formatVnd(updatedAmount),
      };
    });
    setPreviewItems(next);
  }

  function removePreviewCandidate(index: number) {
    if (!previewItems) return;
    const next = previewItems.filter((_, idx) => idx !== index);
    setPreviewItems(next.length > 0 ? next : null);
  }

  async function handleQuickTierChange(expenseId: string, nextTier: SpendingTierValue) {
    const previousSnapshot = allSnapshot;
    const optimistic = applyOptimisticExpensePatch(allSnapshot, expenseId, {
      tier: nextTier,
    });
    setAllSnapshot(optimistic);
    writeCachedSnapshot(userCacheKey, optimistic);
    setBusyExpenseId(expenseId);

    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: nextTier }),
      });
      const data = (await response.json()) as {
        snapshot?: DashboardSnapshot;
        error?: string;
      };
      if (response.ok && data.snapshot) {
        setAllSnapshot(data.snapshot);
        writeCachedSnapshot(userCacheKey, data.snapshot);
      } else if (!response.ok) {
        setAllSnapshot(previousSnapshot);
        writeCachedSnapshot(userCacheKey, previousSnapshot);
      }
    } catch {
      setAllSnapshot(previousSnapshot);
      writeCachedSnapshot(userCacheKey, previousSnapshot);
    } finally {
      setBusyExpenseId(null);
    }
  }

  function startEditing(expense: SerializedExpense) {
    setEditingId(expense.id);
    setEditDraft({
      title: expense.title,
      amountVnd: expense.amountVnd,
      category: expense.category,
      tier: expense.tier,
    });
  }

  async function saveInlineEdit(expenseId: string) {
    if (!editDraft) return;
    const draftToSave = editDraft;
    const previousSnapshot = allSnapshot;
    const optimistic = applyOptimisticExpensePatch(allSnapshot, expenseId, draftToSave);
    setAllSnapshot(optimistic);
    writeCachedSnapshot(userCacheKey, optimistic);
    setEditingId(null);
    setEditDraft(null);
    setBusyExpenseId(expenseId);

    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToSave),
      });
      const data = (await response.json()) as {
        snapshot?: DashboardSnapshot;
        error?: string;
      };
      if (response.ok && data.snapshot) {
        setAllSnapshot(data.snapshot);
        writeCachedSnapshot(userCacheKey, data.snapshot);
      } else if (!response.ok) {
        setAllSnapshot(previousSnapshot);
        writeCachedSnapshot(userCacheKey, previousSnapshot);
      }
    } catch {
      setAllSnapshot(previousSnapshot);
      writeCachedSnapshot(userCacheKey, previousSnapshot);
    } finally {
      setBusyExpenseId(null);
    }
  }

  async function handleDeleteExpense(expenseId: string) {
    const previousSnapshot = allSnapshot;
    const optimistic = applyOptimisticExpenseDelete(allSnapshot, expenseId);
    setAllSnapshot(optimistic);
    writeCachedSnapshot(userCacheKey, optimistic);
    setBusyExpenseId(expenseId);

    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as {
        snapshot?: DashboardSnapshot;
        error?: string;
      };
      if (response.ok && data.snapshot) {
        setAllSnapshot(data.snapshot);
        writeCachedSnapshot(userCacheKey, data.snapshot);
      } else if (!response.ok) {
        setAllSnapshot(previousSnapshot);
        writeCachedSnapshot(userCacheKey, previousSnapshot);
      }
    } catch {
      setAllSnapshot(previousSnapshot);
      writeCachedSnapshot(userCacheKey, previousSnapshot);
    } finally {
      setBusyExpenseId(null);
    }
  }

  const filteredExpenses = useMemo(() => {
    return snapshot.expenses.filter((item) => {
      if (tierFilter !== "ALL" && item.tier !== tierFilter) return false;
      if (categoryFilter !== "ALL" && item.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesCategory = item.category.toLowerCase().includes(q);
        const matchesReason = item.aiReason.toLowerCase().includes(q);
        if (!matchesTitle && !matchesCategory && !matchesReason) return false;
      }
      return true;
    });
  }, [snapshot.expenses, tierFilter, categoryFilter, searchQuery]);

  function handleExportCsv() {
    const headers = [
      "Date",
      "Title",
      "Amount (VND)",
      "Formatted Amount",
      "Value Tier",
      "Category",
      "AI Reason",
    ];
    const rows = filteredExpenses.map((e) => [
      e.spentAt.slice(0, 10),
      `"${e.title.replace(/"/g, '""')}"`,
      String(e.amountVnd),
      `"${e.formattedAmount}"`,
      `"${e.tierLabel}"`,
      `"${e.category}"`,
      `"${e.aiReason.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `self-financial-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const { analytics } = snapshot;

  const showLogSection = activeTab === "log" || activeTab === "all";
  const showInsightsSection = activeTab === "insights" || activeTab === "all";
  const showLedgerSection = activeTab === "ledger" || activeTab === "all";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 pb-20 md:pb-12">
      {/* Minimalist Sticky Top Bar */}
      <header className="sticky top-0 z-20 border-b border-zinc-200/90 bg-white/95 backdrop-blur-md pt-safe">
        <div className="mx-auto max-w-6xl px-4 py-2.5 sm:px-6 flex flex-col gap-2.5">
          {/* Top Row: Brand + View Navigation + Actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
                <Wallet className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-semibold tracking-tight text-zinc-900">
                  Self Financial
                </h1>
                <button
                  type="button"
                  onClick={() => void revalidateFromServer()}
                  title="Client cache active — click to sync with server"
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500 hover:text-zinc-900"
                >
                  <RefreshCw className={`h-2.5 w-2.5 ${isSyncing ? "animate-spin" : ""}`} />
                  <span>{isSyncing ? "Syncing" : "Cached"}</span>
                </button>
              </div>
            </div>

            {/* Desktop Primary View Tabs */}
            <div
              role="tablist"
              aria-label="Workspace view"
              className="hidden md:inline-flex rounded-lg border border-zinc-200 bg-zinc-100/80 p-0.5 text-xs"
            >
              {(
                [
                  { id: "all", label: "Overview" },
                  { id: "insights", label: "Reports & Analyze" },
                  { id: "ledger", label: `Ledger (${snapshot.expenses.length})` },
                  { id: "log", label: "Quick Log" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-md px-3 py-1 font-medium transition ${
                    activeTab === tab.id
                      ? "bg-white text-zinc-900 shadow-2xs"
                      : "text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Utility Actions */}
            <div className="flex items-center gap-1.5">
              {!isStandalone && (
                <button
                  type="button"
                  onClick={() => setShowIosGuide(true)}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  aria-label="iPhone Home Screen app guide"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">iOS App</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredExpenses.length === 0}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                aria-label="Export CSV"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">CSV</span>
              </button>
              {user && (
                <form action={signOut}>
                  <button
                    type="submit"
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    aria-label={`Sign out (${user.name})`}
                    title={`Signed in as ${user.name} (${user.email})`}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{user.name.split(" ")[0]}</span>
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Second Row: Period Filter Strip (All, Year, Quarter, Month, 30D, 7D, Today) */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto">
            <div
              className="inline-flex w-full sm:w-auto rounded-lg border border-zinc-200/80 bg-zinc-100/80 p-0.5"
              role="group"
              aria-label="Reporting period"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handlePeriodChange(opt.value)}
                  className={`flex-1 sm:flex-initial whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    period === opt.value
                      ? "bg-white text-zinc-900 shadow-2xs"
                      : "text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* iOS Safari "Add to Home Screen" Guide Modal */}
      {showIosGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-guide-title"
        >
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-lg space-y-4 mb-safe">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="ios-guide-title" className="text-sm font-semibold text-zinc-900">
                  Add to iPhone Home Screen
                </h2>
                <p className="text-xs text-zinc-500">
                  Install as a standalone full-screen web app
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Close guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ol className="space-y-2 text-xs text-zinc-600">
              <li className="flex items-start gap-2 rounded-lg bg-zinc-50 p-2.5">
                <span className="font-mono font-semibold text-zinc-900">1.</span>
                <div>
                  Tap{" "}
                  <span className="inline-flex items-center gap-0.5 font-medium text-zinc-900">
                    <Share className="h-3 w-3" /> Share
                  </span>{" "}
                  in Safari.
                </div>
              </li>
              <li className="flex items-start gap-2 rounded-lg bg-zinc-50 p-2.5">
                <span className="font-mono font-semibold text-zinc-900">2.</span>
                <div>
                  Select <strong>Add to Home Screen</strong>.
                </div>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="w-full min-h-9 rounded-lg bg-zinc-900 py-2 text-xs font-medium text-white hover:bg-zinc-800"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 space-y-6">
        {/* Minimalist 4-Metric KPI Strip */}
        <section
          aria-label="Spending summary metrics"
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <div className="rounded-xl border border-zinc-200/90 bg-white p-4">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Total Spend</span>
              <span className="font-mono">{analytics.expenseCount} items</span>
            </div>
            <p className="mt-1.5 font-mono text-lg sm:text-xl font-semibold text-zinc-900 truncate">
              {analytics.totalFormatted}
            </p>
            <p className="mt-1 font-mono text-[11px] text-zinc-400 truncate">
              Avg/day: {analytics.averageDailyFormatted}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200/90 bg-white p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                Must have
              </span>
              <span className="font-mono text-zinc-500">
                {analytics.byTier.MUST_HAVE.percentage}%
              </span>
            </div>
            <p className="mt-1.5 font-mono text-lg sm:text-xl font-semibold text-zinc-900 truncate">
              {analytics.byTier.MUST_HAVE.formattedAmount}
            </p>
            <p className="mt-1 font-mono text-[11px] text-zinc-400 truncate">
              {analytics.byTier.MUST_HAVE.count} items · &le;60%
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200/90 bg-white p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Nice to have
              </span>
              <span className="font-mono text-zinc-500">
                {analytics.byTier.NICE_TO_HAVE.percentage}%
              </span>
            </div>
            <p className="mt-1.5 font-mono text-lg sm:text-xl font-semibold text-zinc-900 truncate">
              {analytics.byTier.NICE_TO_HAVE.formattedAmount}
            </p>
            <p className="mt-1 font-mono text-[11px] text-zinc-400 truncate">
              {analytics.byTier.NICE_TO_HAVE.count} items · &le;30%
            </p>
          </div>

          <div
            className={`rounded-xl border p-4 ${
              analytics.byTier.WASTED.isOverRecommended
                ? "border-rose-200 bg-rose-50/30"
                : "border-zinc-200/90 bg-white"
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700">
                <span className="h-2 w-2 rounded-full bg-rose-600" />
                Wasted
              </span>
              <span className="font-mono text-rose-600 font-medium">
                {analytics.byTier.WASTED.percentage}%
              </span>
            </div>
            <p className="mt-1.5 font-mono text-lg sm:text-xl font-semibold text-zinc-900 truncate">
              {analytics.byTier.WASTED.formattedAmount}
            </p>
            <p className="mt-1 font-mono text-[11px] text-zinc-400 truncate">
              {analytics.byTier.WASTED.count} items · Target &le;10%
            </p>
          </div>
        </section>

        {/* Minimalist Natural-Language Expense Input Section */}
        {showLogSection && (
          <section
            aria-labelledby="quick-log-heading"
            className="rounded-xl border border-zinc-200/90 bg-white p-4 sm:p-5 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2
                  id="quick-log-heading"
                  className="text-sm font-semibold text-zinc-900"
                >
                  Log Expense
                </h2>
                <button
                  type="button"
                  onClick={() => setShowQuickChips((prev) => !prev)}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:text-zinc-900"
                >
                  {showQuickChips ? "Hide presets" : "Presets & units"}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="expense-date" className="text-xs text-zinc-500">
                  Date
                </label>
                <input
                  id="expense-date"
                  type="date"
                  value={spentAtDate}
                  onChange={(e) => setSpentAtDate(e.target.value)}
                  className="min-h-8 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2.5 py-1 font-mono text-xs text-zinc-800"
                />
              </div>
            </div>

            {/* Optional Compact Presets & Shorthand Tokens */}
            {showQuickChips && (
              <div className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-2.5">
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap">
                  {QUICK_EXPENSE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setRawInput((prev) => appendQuickExpenseChip(prev, preset.text));
                        setPreviewItems(null);
                      }}
                      className="shrink-0 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:border-zinc-400 active:scale-98 transition"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <span className="text-[11px] text-zinc-400 shrink-0">Units:</span>
                  {QUICK_AMOUNT_TOKENS.map((token) => (
                    <button
                      key={token}
                      type="button"
                      onClick={() => {
                        setRawInput((prev) => appendAmountShorthand(prev, token));
                        setPreviewItems(null);
                      }}
                      className="shrink-0 rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-700 hover:border-zinc-400"
                    >
                      +{token}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleDirectParseAndSave} className="space-y-2.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <input
                  type="text"
                  value={rawInput}
                  enterKeyHint="send"
                  onChange={(e) => {
                    setRawInput(e.target.value);
                    if (previewItems) {
                      setPreviewItems(null);
                    }
                  }}
                  placeholder='coffee 30k, lunch 50k, electricity 850k...'
                  aria-label="Expense text input"
                  className="flex-1 min-h-10 rounded-lg border border-zinc-200 bg-zinc-50/40 px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-hidden"
                />

                <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handlePreviewParse}
                    disabled={isParsing || isSaving}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {isParsing ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    Preview
                  </button>

                  <button
                    type="submit"
                    disabled={isSaving || isParsing}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PlusCircle className="h-3.5 w-3.5" />
                    )}
                    {previewItems ? `Save (${previewItems.length})` : "Log"}
                  </button>
                </div>
              </div>
            </form>

            {/* Feedback Banner */}
            {feedback && (
              <div
                role="status"
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${
                  feedback.tone === "success"
                    ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                    : "border-rose-200 bg-rose-50/60 text-rose-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  {feedback.tone === "success" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                  )}
                  <span>{feedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  aria-label="Dismiss message"
                  className="p-0.5 text-zinc-400 hover:text-zinc-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* AI Preview Breakdown */}
            {previewItems && previewItems.length > 0 && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-900">
                      Preview ({previewItems.length})
                    </span>
                    {previewModel && (
                      <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 border border-zinc-200">
                        {previewModel}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewItems(null)}
                    className="text-xs text-zinc-500 hover:text-zinc-800"
                  >
                    Discard
                  </button>
                </div>

                <div className="divide-y divide-zinc-200/70">
                  {previewItems.map((item, idx) => (
                    <div
                      key={`${item.title}-${idx}`}
                      className="py-2 first:pt-0 last:pb-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) =>
                            updatePreviewCandidate(idx, { title: e.target.value })
                          }
                          className="w-36 rounded border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-900"
                        />
                        <input
                          type="number"
                          min={1}
                          step={1000}
                          value={item.amountVnd}
                          onChange={(e) =>
                            updatePreviewCandidate(idx, {
                              amountVnd: Math.max(1, Number(e.target.value) || 0),
                            })
                          }
                          className="w-28 rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-xs text-zinc-900"
                        />
                        <select
                          value={item.category}
                          onChange={(e) =>
                            updatePreviewCandidate(idx, { category: e.target.value })
                          }
                          className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700"
                        >
                          {EXPENSE_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2">
                        <div className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5">
                          {SPENDING_TIERS.map((t) => {
                            const active = item.tier === t;
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => updatePreviewCandidate(idx, { tier: t })}
                                className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
                                  active
                                    ? getTierBadgeClasses(t)
                                    : "text-zinc-500 hover:text-zinc-900"
                                }`}
                              >
                                {getTierLabel(t)}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => removePreviewCandidate(idx)}
                          className="p-1 text-zinc-400 hover:text-rose-600"
                          aria-label="Remove preview item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Enhanced Spend Overview & Analytics Report (Monthly / Quarterly / Yearly / Daily) */}
        {showInsightsSection && <SpendReportPanel analytics={analytics} />}

        {/* Minimalist Expense Ledger Section */}
        {showLedgerSection && (
          <section
            aria-labelledby="ledger-heading"
            className="rounded-xl border border-zinc-200/90 bg-white p-4 sm:p-5 space-y-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="ledger-heading" className="text-sm font-semibold text-zinc-900">
                  Ledger
                </h2>
                <p className="text-xs text-zinc-500">
                  {filteredExpenses.length} expense{filteredExpenses.length === 1 ? "" : "s"}{" "}
                  shown · Click any value tier to reclassify immediately.
                </p>
              </div>

              {/* Filter Controls */}
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                <div className="inline-flex overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-100/80 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setTierFilter("ALL")}
                    className={`flex-1 sm:flex-initial whitespace-nowrap rounded-md px-2.5 py-1 font-medium ${
                      tierFilter === "ALL"
                        ? "bg-white text-zinc-900 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-900"
                    }`}
                  >
                    All ({snapshot.expenses.length})
                  </button>
                  {SPENDING_TIERS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTierFilter(t)}
                      className={`flex-1 sm:flex-initial whitespace-nowrap rounded-md px-2.5 py-1 font-medium ${
                        tierFilter === t
                          ? "bg-white text-zinc-900 shadow-2xs"
                          : "text-zinc-500 hover:text-zinc-900"
                      }`}
                    >
                      {getTierLabel(t)} ({analytics.byTier[t].count})
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:flex items-center gap-2">
                  <div className="relative flex items-center">
                    <Filter className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-zinc-400" />
                    <select
                      aria-label="Filter by category"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="w-full min-h-8 rounded-lg border border-zinc-200 bg-white pl-8 pr-3 py-1 text-xs text-zinc-700"
                    >
                      <option value="ALL">All Categories</option>
                      {snapshot.categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative flex items-center">
                    <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-zinc-400" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search..."
                      aria-label="Search expenses"
                      className="w-full min-h-8 rounded-lg border border-zinc-200 bg-white pl-8 pr-3 py-1 text-xs text-zinc-800 placeholder:text-zinc-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            {filteredExpenses.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-200 py-10 text-center">
                <p className="text-xs font-medium text-zinc-600">No matching expenses</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Log an item like{" "}
                  <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono">
                    coffee 30k, lunch 50k
                  </code>{" "}
                  above.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile Card List */}
                <div className="divide-y divide-zinc-100 md:hidden" data-testid="mobile-expense-list">
                  {filteredExpenses.map((expense) => {
                    const isEditing = editingId === expense.id && editDraft !== null;
                    const isBusy = busyExpenseId === expense.id;

                    return (
                      <article
                        key={expense.id}
                        className={`py-3 first:pt-0 last:pb-0 space-y-2.5 transition ${
                          isBusy ? "opacity-60" : ""
                        }`}
                      >
                        {isEditing ? (
                          <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
                            <input
                              type="text"
                              value={editDraft.title}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, title: e.target.value })
                              }
                              className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-900"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                min={1}
                                step={1000}
                                value={editDraft.amountVnd}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    amountVnd: Math.max(1, Number(e.target.value) || 0),
                                  })
                                }
                                className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 font-mono text-sm text-zinc-900"
                              />
                              <select
                                value={editDraft.category}
                                onChange={(e) =>
                                  setEditDraft({ ...editDraft, category: e.target.value })
                                }
                                className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm"
                              >
                                {EXPENSE_CATEGORIES.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditDraft(null);
                                }}
                                className="min-h-8 rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => saveInlineEdit(expense.id)}
                                className="min-h-8 rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-sm font-medium text-zinc-900">
                                    {expense.title}
                                  </h3>
                                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">
                                    {expense.category}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-xs text-zinc-400">
                                  {expense.aiReason}
                                </p>
                              </div>

                              <div className="text-right shrink-0">
                                <p className="font-mono text-sm font-semibold text-zinc-900">
                                  {expense.formattedAmount}
                                </p>
                                <p className="font-mono text-[11px] text-zinc-400">
                                  {expense.spentAt.slice(0, 10)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <div className="grid flex-1 grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-0.5">
                                {SPENDING_TIERS.map((t) => {
                                  const active = expense.tier === t;
                                  return (
                                    <button
                                      key={t}
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => {
                                        if (expense.tier !== t) {
                                          void handleQuickTierChange(expense.id, t);
                                        }
                                      }}
                                      className={`min-h-7 rounded-md border text-[11px] font-medium transition ${
                                        active
                                          ? getTierBadgeClasses(t)
                                          : "border-transparent text-zinc-500"
                                      }`}
                                    >
                                      {getTierLabel(t)}
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => startEditing(expense)}
                                  className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500"
                                  aria-label={`Edit ${expense.title}`}
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExpense(expense.id)}
                                  className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 hover:text-rose-600"
                                  aria-label={`Delete ${expense.title}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>

                {/* Desktop Minimal Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200/80 text-zinc-400">
                        <th className="pb-2 pr-3 font-medium">Expense</th>
                        <th className="pb-2 px-3 font-medium">Amount</th>
                        <th className="pb-2 px-3 font-medium">Value Tier</th>
                        <th className="pb-2 px-3 font-medium">Category</th>
                        <th className="pb-2 px-3 font-medium">Date</th>
                        <th className="pb-2 pl-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filteredExpenses.map((expense) => {
                        const isEditing = editingId === expense.id && editDraft !== null;
                        const isBusy = busyExpenseId === expense.id;

                        return (
                          <tr
                            key={expense.id}
                            className={`hover:bg-zinc-50/70 transition ${
                              isBusy ? "opacity-60" : ""
                            }`}
                          >
                            <td className="py-2.5 pr-3">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editDraft.title}
                                  onChange={(e) =>
                                    setEditDraft({ ...editDraft, title: e.target.value })
                                  }
                                  className="w-44 rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-900"
                                />
                              ) : (
                                <div>
                                  <p className="font-medium text-zinc-900 text-xs">
                                    {expense.title}
                                  </p>
                                  <p className="text-[11px] text-zinc-400">
                                    {expense.aiReason}
                                  </p>
                                </div>
                              )}
                            </td>

                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={1}
                                  step={1000}
                                  value={editDraft.amountVnd}
                                  onChange={(e) =>
                                    setEditDraft({
                                      ...editDraft,
                                      amountVnd: Math.max(1, Number(e.target.value) || 0),
                                    })
                                  }
                                  className="w-28 rounded border border-zinc-200 px-2 py-1 font-mono text-xs text-zinc-900"
                                />
                              ) : (
                                <span className="font-mono text-xs font-semibold text-zinc-900">
                                  {expense.formattedAmount}
                                </span>
                              )}
                            </td>

                            <td className="py-2.5 px-3">
                              <div className="inline-flex items-center gap-1">
                                {SPENDING_TIERS.map((t) => {
                                  const active =
                                    (isEditing ? editDraft.tier : expense.tier) === t;
                                  return (
                                    <button
                                      key={t}
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => {
                                        if (isEditing) {
                                          setEditDraft({ ...editDraft, tier: t });
                                        } else if (expense.tier !== t) {
                                          void handleQuickTierChange(expense.id, t);
                                        }
                                      }}
                                      className={`rounded border px-2 py-0.5 text-[11px] font-medium transition ${
                                        active
                                          ? getTierBadgeClasses(t)
                                          : "border-transparent text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                                      }`}
                                    >
                                      {getTierLabel(t)}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>

                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {isEditing ? (
                                <select
                                  value={editDraft.category}
                                  onChange={(e) =>
                                    setEditDraft({
                                      ...editDraft,
                                      category: e.target.value,
                                    })
                                  }
                                  className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs"
                                >
                                  {EXPENSE_CATEGORIES.map((cat) => (
                                    <option key={cat} value={cat}>
                                      {cat}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
                                  {expense.category}
                                </span>
                              )}
                            </td>

                            <td className="py-2.5 px-3 whitespace-nowrap font-mono text-xs text-zinc-400">
                              {expense.spentAt.slice(0, 10)}
                            </td>

                            <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                              {isEditing ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => saveInlineEdit(expense.id)}
                                    className="rounded bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingId(null);
                                      setEditDraft(null);
                                    }}
                                    className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => startEditing(expense)}
                                    className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
                                    title="Edit expense"
                                    aria-label={`Edit ${expense.title}`}
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteExpense(expense.id)}
                                    className="rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                                    title="Delete expense"
                                    aria-label={`Delete ${expense.title}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur-md pb-safe md:hidden"
      >
        <div className="grid grid-cols-4 px-2 py-1">
          <button
            type="button"
            onClick={() => setActiveTab("log")}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition ${
              activeTab === "log"
                ? "text-zinc-900 bg-zinc-100"
                : "text-zinc-400 hover:text-zinc-800"
            }`}
          >
            <PlusCircle className="h-4 w-4" />
            <span>Log</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("insights")}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition ${
              activeTab === "insights"
                ? "text-zinc-900 bg-zinc-100"
                : "text-zinc-400 hover:text-zinc-800"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Reports</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ledger")}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition ${
              activeTab === "ledger"
                ? "text-zinc-900 bg-zinc-100"
                : "text-zinc-400 hover:text-zinc-800"
            }`}
          >
            <ReceiptText className="h-4 w-4" />
            <span>Ledger ({snapshot.expenses.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition ${
              activeTab === "all"
                ? "text-zinc-900 bg-zinc-100"
                : "text-zinc-400 hover:text-zinc-800"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            <span>Overview</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
