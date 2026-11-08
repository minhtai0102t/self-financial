"use client";

import { gsap } from "gsap";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  LogOut,
  MoreHorizontal,
  RefreshCw,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { signOut } from "@/features/auth/actions";
import {
  applyOptimisticExpenseCreate,
  applyOptimisticExpenseDelete,
  applyOptimisticExpensePatch,
  buildOptimisticExpensesFromInput,
  deriveSnapshotForPeriod,
  readCachedParsePreview,
  readCachedSnapshot,
  reconcileOptimisticExpenseCreate,
  rollbackOptimisticExpenseCreate,
  writeCachedParsePreview,
  writeCachedSnapshot,
} from "@/features/expenses/client-cache";
import {
  EXPENSE_CATEGORIES,
  formatVnd,
  getTierLabel,
  shiftDateKey,
  SPENDING_TIERS,
  type SpendingTierValue,
  toLocalDateKey,
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
  SerializedBatch,
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

type ViewTab = "log" | "reports";

function subscribeLocalDate(callback: () => void): () => void {
  let timer: number;
  function scheduleMidnight() {
    window.clearTimeout(timer);
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    timer = window.setTimeout(update, midnight.getTime() - now.getTime());
  }
  function update() {
    callback();
    scheduleMidnight();
  }
  scheduleMidnight();
  window.addEventListener("focus", update);
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener("focus", update);
  };
}

function getLocalDateSnapshot(): string {
  return toLocalDateKey();
}

function getLocalDateServerSnapshot(): string {
  return "";
}

function subscribeStandaloneMode(callback: () => void): () => void {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getStandaloneModeSnapshot(): boolean {
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
  const [allSnapshot, setAllSnapshot] = useState<DashboardSnapshot>(initialSnapshot);
  const [activeTab, setActiveTab] = useState<ViewTab>("log");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [rawInput, setRawInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewItems, setPreviewItems] = useState<ParsedExpenseCandidate[] | null>(null);
  const [previewModel, setPreviewModel] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
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
  const mainRef = useRef<HTMLElement>(null);
  const previousExpenseIds = useRef(new Set<string>());

  const today = useSyncExternalStore(
    subscribeLocalDate,
    getLocalDateSnapshot,
    getLocalDateServerSnapshot,
  );
  const spentAtDate = selectedDate ?? today;
  const isStandalone = useSyncExternalStore(
    subscribeStandaloneMode,
    getStandaloneModeSnapshot,
    getStandaloneModeServerSnapshot,
  );

  useEffect(() => {
    writeCachedSnapshot(userCacheKey, initialSnapshot);
  }, [userCacheKey, initialSnapshot]);

  const snapshot = useMemo(
    () => deriveSnapshotForPeriod(
      allSnapshot, "today", new Date(`${spentAtDate}T12:00:00`),
    ),
    [allSnapshot, spentAtDate],
  );
  const { analytics } = snapshot;

  const filteredExpenses = useMemo(() => snapshot.expenses.filter((item) => {
    if (tierFilter !== "ALL" && item.tier !== tierFilter) return false;
    if (categoryFilter !== "ALL" && item.category !== categoryFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    return !query || [item.title, item.category, item.aiReason]
      .some((value) => value.toLowerCase().includes(query));
  }), [snapshot.expenses, tierFilter, categoryFilter, searchQuery]);

  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(mainRef.current, { opacity: 0, y: 6 }, {
        opacity: 1, y: 0, duration: 0.2, ease: "power2.out",
        clearProps: "opacity,transform",
      });
    });
    return () => media.revert();
  }, [activeTab, spentAtDate]);

  useLayoutEffect(() => {
    const previous = previousExpenseIds.current;
    previousExpenseIds.current = new Set(filteredExpenses.map((item) => item.id));
    if (filteredExpenses.length <= previous.size || activeTab !== "log") return;
    const rows = [...(mainRef.current?.querySelectorAll<HTMLElement>("[data-expense-id]") ?? [])]
      .filter((row) => !previous.has(row.dataset.expenseId ?? ""));
    if (rows.length === 0) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(rows, { opacity: 0, y: 4 }, {
        opacity: 1, y: 0, duration: 0.16, stagger: { amount: 0.06 },
        ease: "power2.out", clearProps: "opacity,transform",
      });
    });
    return () => media.revert();
  }, [filteredExpenses, activeTab]);

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
      // Keep cached client state if offline.
    } finally {
      setIsSyncing(false);
    }
  }

  function revalidateIfStale() {
    if (isSyncing || busyExpenseId) return;
    const cached = readCachedSnapshot(userCacheKey, "all");
    if (!cached || cached.isStale) void revalidateFromServer();
  }

  function changeDate(date: string | null) {
    setSelectedDate(date);
    setTierFilter("ALL");
    setCategoryFilter("ALL");
    setSearchQuery("");
    setEditingId(null);
    setEditDraft(null);
    setFeedback(null);
    revalidateIfStale();
  }

  async function handlePreviewParse() {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      setFeedback({ tone: "error", message: "Enter an expense first." });
      return;
    }

    const cachedPreview = readCachedParsePreview(trimmed);
    if (cachedPreview) {
      setPreviewItems(cachedPreview.items);
      setPreviewModel(`${cachedPreview.modelUsed} (cached)`);
      return;
    }

    const localPlan = buildOptimisticExpensesFromInput({
      rawInput: trimmed,
      spentAtIso: new Date(`${selectedDate ?? toLocalDateKey()}T12:00:00`).toISOString(),
      existingExpenses: allSnapshot.expenses,
    });
    if (localPlan.isHighConfidence && localPlan.candidates.length > 0) {
      setPreviewItems(localPlan.candidates);
      setPreviewModel(localPlan.modelUsed);
      writeCachedParsePreview(trimmed, {
        items: localPlan.candidates,
        modelUsed: localPlan.modelUsed,
      });
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
        setFeedback({ tone: "error", message: data.error ?? "Failed to parse expenses." });
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

  async function handleDirectParseAndSave(event?: React.FormEvent) {
    event?.preventDefault();
    const trimmed = rawInput.trim();
    if (!trimmed || !spentAtDate) return;
    const spentAtIso = new Date(`${selectedDate ?? toLocalDateKey()}T12:00:00`).toISOString();
    const optimisticPlan = buildOptimisticExpensesFromInput({
      rawInput: trimmed,
      spentAtIso,
      previewItems,
      previewModel,
      existingExpenses: allSnapshot.expenses,
    });

    if (optimisticPlan.optimisticExpenses.length > 0) {
      const optimisticIds = optimisticPlan.optimisticExpenses.map((item) => item.id);
      const optimisticBatchId = optimisticPlan.batchId;

      setAllSnapshot((prev) => {
        const next = applyOptimisticExpenseCreate(prev, optimisticPlan.optimisticExpenses, {
          id: optimisticBatchId,
          rawInput: trimmed,
          aiModel: optimisticPlan.modelUsed,
        });
        writeCachedSnapshot(userCacheKey, next);
        return next;
      });
      setRawInput("");
      setPreviewItems(null);
      setPreviewModel(null);
      setFeedback({
        tone: "success",
        message: `Logged ${optimisticPlan.optimisticExpenses.length} expense(s).`,
      });
      setIsSyncing(true);
      try {
        const response = await fetch("/api/expenses?includeSnapshot=0", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rawInput: trimmed,
            spentAt: spentAtIso,
            includeSnapshot: false,
            ...(optimisticPlan.isHighConfidence ? {
              items: optimisticPlan.candidates,
              modelUsed: optimisticPlan.modelUsed,
            } : {}),
          }),
        });
        const data = (await response.json()) as {
          expenses?: SerializedExpense[];
          batch?: SerializedBatch;
          modelUsed?: string;
          snapshot?: DashboardSnapshot;
          error?: string;
        };
        if (!response.ok || (!data.expenses && !data.snapshot)) {
          setAllSnapshot((prev) => {
            const rolledBack = rollbackOptimisticExpenseCreate(prev, optimisticIds, optimisticBatchId);
            writeCachedSnapshot(userCacheKey, rolledBack);
            return rolledBack;
          });
          setRawInput((prev) => prev.trim() ? prev : trimmed);
          setFeedback({ tone: "error", message: data.error ?? "Failed to save expenses." });
          return;
        }
        setAllSnapshot((prev) => {
          const reconciled = data.snapshot ?? reconcileOptimisticExpenseCreate(
            prev, optimisticIds, data.expenses ?? [], data.batch, optimisticBatchId,
          );
          writeCachedSnapshot(userCacheKey, reconciled);
          return reconciled;
        });
        if (data.expenses?.length && !optimisticPlan.isHighConfidence) {
          setFeedback({ tone: "success", message: `Logged ${data.expenses.length} expense(s).` });
        }
      } catch (error) {
        setAllSnapshot((prev) => {
          const rolledBack = rollbackOptimisticExpenseCreate(prev, optimisticIds, optimisticBatchId);
          writeCachedSnapshot(userCacheKey, rolledBack);
          return rolledBack;
        });
        setRawInput((prev) => prev.trim() ? prev : trimmed);
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "Failed to save expenses.",
        });
      } finally {
        setIsSyncing(false);
      }
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/expenses?includeSnapshot=0", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: trimmed, spentAt: spentAtIso, includeSnapshot: false }),
      });
      const data = (await response.json()) as {
        expenses?: SerializedExpense[];
        batch?: SerializedBatch;
        modelUsed?: string;
        snapshot?: DashboardSnapshot;
        error?: string;
      };
      if (!response.ok || (!data.expenses && !data.snapshot)) {
        setFeedback({ tone: "error", message: data.error ?? "Failed to save expenses." });
        return;
      }
      setAllSnapshot((prev) => {
        const next = data.snapshot ?? applyOptimisticExpenseCreate(prev, data.expenses ?? [], data.batch);
        writeCachedSnapshot(userCacheKey, next);
        return next;
      });
      setRawInput("");
      setPreviewItems(null);
      setPreviewModel(null);
      setFeedback({ tone: "success", message: `Logged ${data.expenses?.length ?? 0} expense(s).` });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save expenses.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function updatePreviewCandidate(index: number, patch: Partial<ParsedExpenseCandidate>) {
    if (!previewItems) return;
    setPreviewItems(previewItems.map((item, idx) => {
      if (idx !== index) return item;
      const amountVnd = patch.amountVnd ?? item.amountVnd;
      return { ...item, ...patch, amountVnd, formattedAmount: formatVnd(amountVnd) };
    }));
  }

  function removePreviewCandidate(index: number) {
    if (!previewItems) return;
    const next = previewItems.filter((_, idx) => idx !== index);
    setPreviewItems(next.length > 0 ? next : null);
  }

  async function handleQuickTierChange(expenseId: string, nextTier: SpendingTierValue) {
    if (expenseId.startsWith("optimistic-")) return;
    const previousSnapshot = allSnapshot;
    const optimistic = applyOptimisticExpensePatch(allSnapshot, expenseId, { tier: nextTier });
    setAllSnapshot(optimistic);
    writeCachedSnapshot(userCacheKey, optimistic);
    setBusyExpenseId(expenseId);
    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}?includeSnapshot=0`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: nextTier, includeSnapshot: false }),
      });
      const data = (await response.json()) as { snapshot?: DashboardSnapshot; error?: string };
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
    if (expense.id.startsWith("optimistic-")) return;
    setEditingId(expense.id);
    setEditDraft({
      title: expense.title,
      amountVnd: expense.amountVnd,
      category: expense.category,
      tier: expense.tier,
    });
  }

  async function saveInlineEdit(expenseId: string) {
    if (!editDraft || expenseId.startsWith("optimistic-")) return;
    const draftToSave = editDraft;
    const previousSnapshot = allSnapshot;
    const optimistic = applyOptimisticExpensePatch(allSnapshot, expenseId, draftToSave);
    setAllSnapshot(optimistic);
    writeCachedSnapshot(userCacheKey, optimistic);
    setEditingId(null);
    setEditDraft(null);
    setBusyExpenseId(expenseId);
    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}?includeSnapshot=0`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draftToSave, includeSnapshot: false }),
      });
      const data = (await response.json()) as { snapshot?: DashboardSnapshot; error?: string };
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
    if (expenseId.startsWith("optimistic-")) return;
    const previousSnapshot = allSnapshot;
    const optimistic = applyOptimisticExpenseDelete(allSnapshot, expenseId);
    setAllSnapshot(optimistic);
    writeCachedSnapshot(userCacheKey, optimistic);
    setBusyExpenseId(expenseId);
    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}?includeSnapshot=0`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { snapshot?: DashboardSnapshot; error?: string };
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

  function handleExportCsv() {
    const headers = ["Date", "Title", "Amount (VND)", "Formatted Amount", "Value Tier", "Category", "AI Reason"];
    const expenses = activeTab === "reports" ? allSnapshot.expenses : filteredExpenses;
    const rows = expenses.map((expense) => [
      toLocalDateKey(new Date(expense.spentAt)),
      `"${expense.title.replace(/"/g, '""')}"`,
      String(expense.amountVnd),
      `"${expense.formattedAmount}"`,
      `"${expense.tierLabel}"`,
      `"${expense.category}"`,
      `"${expense.aiReason.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `self-financial-expenses-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const dateLabel = spentAtDate && spentAtDate !== today
    ? new Date(`${spentAtDate}T12:00:00`).toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    })
    : "Today";
  const controlClass = "min-h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm";

  return (
    <div className="min-h-screen bg-white text-zinc-900 pb-safe">
      <header className="border-b border-zinc-100 pt-safe">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <h1 className="text-sm font-semibold tracking-tight">Self Financial</h1>
          <nav aria-label="Workspace view" className="flex items-center gap-5 text-sm">
            {(["log", "reports"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                aria-current={activeTab === tab ? "page" : undefined}
                onClick={() => { setActiveTab(tab); revalidateIfStale(); }}
                className={`min-h-11 border-b-2 transition-colors ${
                  activeTab === tab ? "border-zinc-900 font-medium" : "border-transparent text-zinc-400 hover:text-zinc-700"
                }`}
              >
                {tab === "log" ? "Log" : "Reports"}
              </button>
            ))}
          </nav>
          <details className="relative">
            <summary
              aria-label="Workspace options"
              className="flex h-11 w-8 cursor-pointer list-none items-center justify-center text-zinc-400 hover:text-zinc-900 [&::-webkit-details-marker]:hidden"
            >
              <MoreHorizontal className="h-5 w-5" />
            </summary>
            <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
              <button type="button" onClick={() => void revalidateFromServer()} disabled={isSyncing}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-zinc-50">
                <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin motion-reduce:animate-none" : ""}`} />
                {isSyncing ? "Syncing..." : "Refresh"}
              </button>
              <button type="button" onClick={handleExportCsv}
                disabled={(activeTab === "reports" ? allSnapshot.expenses : filteredExpenses).length === 0}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-zinc-50 disabled:opacity-40">
                <Download className="h-4 w-4" /> {activeTab === "reports" ? "Export all expenses" : "Export this day"}
              </button>
              {!isStandalone && (
                <button type="button" onClick={() => setShowIosGuide(true)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-zinc-50">
                  <Smartphone className="h-4 w-4" /> Add to Home Screen
                </button>
              )}
              {user && (
                <form action={signOut}>
                  <button type="submit" aria-label={`Sign out (${user.name})`}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-zinc-50">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </form>
              )}
            </div>
          </details>
        </div>
      </header>

      <main ref={mainRef} className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        {activeTab === "log" ? (
          <div className="space-y-8">
            <section aria-label="Log expenses" className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-medium tracking-tight sm:text-2xl">{dateLabel}</h2>
                  <label htmlFor="expense-date" className="mt-2 inline-flex">
                    <span className="sr-only">Expense date</span>
                    <input id="expense-date" type="date" aria-label="Expense date"
                      value={spentAtDate}
                      onChange={(event) => {
                        if (event.target.value) changeDate(event.target.value === today ? null : event.target.value);
                      }}
                      className="min-h-11 max-w-full rounded-md bg-transparent text-sm text-zinc-500"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  {spentAtDate && spentAtDate !== today && (
                    <button type="button" onClick={() => changeDate(null)} className="min-h-11 px-2 text-xs text-zinc-500 hover:text-zinc-900">
                      Today
                    </button>
                  )}
                  <button type="button" aria-label="Previous day" disabled={!spentAtDate}
                    onClick={() => changeDate(shiftDateKey(spentAtDate, -1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-zinc-50 disabled:opacity-30">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Next day" disabled={!spentAtDate}
                    onClick={() => changeDate(shiftDateKey(spentAtDate, 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-zinc-50 disabled:opacity-30">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleDirectParseAndSave} className="flex gap-2">
                <input type="text" value={rawInput} enterKeyHint="send"
                  aria-label="Expense text input" placeholder="coffee 30k, lunch 50k..."
                  onChange={(event) => {
                    setRawInput(event.target.value);
                    setPreviewItems(null);
                  }}
                  className="min-h-12 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 text-base placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white"
                />
                <button type="submit" disabled={isSaving || isParsing || !rawInput.trim() || !spentAtDate}
                  className="min-h-12 shrink-0 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40">
                  {isSaving ? "Saving..." : previewItems ? `Save ${previewItems.length}` : "Log"}
                </button>
              </form>

              <details>
                <summary className="w-fit cursor-pointer text-xs text-zinc-400 hover:text-zinc-700">Input options</summary>
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {QUICK_EXPENSE_PRESETS.map((preset) => (
                      <button key={preset.label} type="button"
                        onClick={() => {
                          setRawInput((prev) => appendQuickExpenseChip(prev, preset.text));
                          setPreviewItems(null);
                        }}
                        className="min-h-9 rounded-lg bg-zinc-50 px-3 text-xs text-zinc-600 hover:bg-zinc-100">
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_AMOUNT_TOKENS.map((token) => (
                      <button key={token} type="button"
                        onClick={() => {
                          setRawInput((prev) => appendAmountShorthand(prev, token));
                          setPreviewItems(null);
                        }}
                        className="min-h-9 rounded-lg px-3 font-mono text-xs text-zinc-500 hover:bg-zinc-50">
                        +{token}
                      </button>
                    ))}
                    <button type="button" onClick={handlePreviewParse}
                      disabled={isParsing || isSaving || !rawInput.trim() || !spentAtDate}
                      className="min-h-9 rounded-lg border border-zinc-200 px-3 text-xs disabled:opacity-40">
                      {isParsing ? "Parsing..." : "Preview before saving"}
                    </button>
                  </div>
                </div>
              </details>

              {feedback && (
                <div role="status" className={`flex items-center gap-2 text-sm ${
                  feedback.tone === "error" ? "text-rose-700" : "text-zinc-600"
                }`}>
                  {feedback.tone === "error" ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                  <span className="flex-1">{feedback.message}</span>
                  <button type="button" aria-label="Dismiss message" onClick={() => setFeedback(null)} className="p-2 text-zinc-400">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {previewItems && (
                <div className="space-y-4 rounded-xl border border-zinc-200 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <h3 className="font-medium">Preview</h3>
                    <button type="button" onClick={() => setPreviewItems(null)} className="min-h-9 text-xs text-zinc-500">Discard</button>
                  </div>
                  {previewItems.map((item, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex gap-2">
                        <input aria-label={`Preview expense ${index + 1} title`} value={item.title}
                          onChange={(event) => updatePreviewCandidate(index, { title: event.target.value })}
                          className={`${controlClass} min-w-0 flex-1`} />
                        <input type="number" min={1} aria-label={`Preview expense ${index + 1} amount`}
                          value={item.amountVnd} onChange={(event) => updatePreviewCandidate(index, { amountVnd: Math.max(1, Number(event.target.value) || 0) })}
                          className={`${controlClass} w-28 font-mono`} />
                      </div>
                      <div className="flex gap-2">
                        <select aria-label={`Preview expense ${index + 1} category`} value={item.category}
                          onChange={(event) => updatePreviewCandidate(index, { category: event.target.value })}
                          className={`${controlClass} min-w-0 flex-1`}>
                          {EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                        </select>
                        <select aria-label={`Preview expense ${index + 1} tier`} value={item.tier}
                          onChange={(event) => updatePreviewCandidate(index, { tier: event.target.value as SpendingTierValue })}
                          className={`${controlClass} min-w-0 flex-1`}>
                          {SPENDING_TIERS.map((tier) => <option key={tier} value={tier}>{getTierLabel(tier)}</option>)}
                        </select>
                        <button type="button" aria-label="Remove preview item" onClick={() => removePreviewCandidate(index)} className="p-2 text-zinc-400 hover:text-rose-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section aria-label="Daily expenses" className="border-t border-zinc-100 pt-6">
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <h3 className="text-xs text-zinc-400">{snapshot.expenses.length} expense(s)</h3>
                <p data-testid="day-total" className="font-mono text-lg font-medium">
                  {spentAtDate ? analytics.totalFormatted : "..."}
                </p>
              </div>
              {snapshot.expenses.length > 0 && (
                <details className="mb-4">
                  <summary className="w-fit cursor-pointer text-xs text-zinc-400 hover:text-zinc-700">Search &amp; filters</summary>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <input type="search" aria-label="Search expenses" placeholder="Search..." value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)} className={`${controlClass} min-w-0`} />
                    <select aria-label="Filter by category" value={categoryFilter}
                      onChange={(event) => setCategoryFilter(event.target.value)} className={controlClass}>
                      <option value="ALL">All categories</option>
                      {snapshot.categories.map((category) => <option key={category}>{category}</option>)}
                    </select>
                    <select aria-label="Filter by tier" value={tierFilter}
                      onChange={(event) => setTierFilter(event.target.value as SpendingTierValue | "ALL")} className={controlClass}>
                      <option value="ALL">All tiers</option>
                      {SPENDING_TIERS.map((tier) => <option key={tier} value={tier}>{getTierLabel(tier)}</option>)}
                    </select>
                  </div>
                </details>
              )}
              {!spentAtDate ? (
                <p className="py-8 text-center text-sm text-zinc-400">Loading this day...</p>
              ) : filteredExpenses.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-400">
                  {snapshot.expenses.length ? "No matching expenses." : "Nothing logged for this day."}
                </p>
              ) : (
                <div data-testid="expense-list" className="divide-y divide-zinc-100">
                  {filteredExpenses.map((expense) => {
                    const isEditing = editingId === expense.id && editDraft !== null;
                    const isBusy = busyExpenseId === expense.id || expense.id.startsWith("optimistic-");
                    return (
                      <article key={expense.id} data-expense-id={expense.id} className={`py-4 ${isBusy ? "opacity-60" : ""}`}>
                        {isEditing ? (
                          <div className="space-y-3">
                            <input aria-label="Expense title" value={editDraft.title}
                              onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })}
                              className={`${controlClass} w-full`} />
                            <div className="grid grid-cols-2 gap-2">
                              <input type="number" min={1} aria-label="Expense amount" value={editDraft.amountVnd}
                                onChange={(event) => setEditDraft({ ...editDraft, amountVnd: Math.max(1, Number(event.target.value) || 0) })}
                                className={`${controlClass} min-w-0 font-mono`} />
                              <select aria-label="Expense category" value={editDraft.category}
                                onChange={(event) => setEditDraft({ ...editDraft, category: event.target.value })}
                                className={`${controlClass} min-w-0`}>
                                {EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                              </select>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <select aria-label="Expense tier" value={editDraft.tier}
                                onChange={(event) => setEditDraft({ ...editDraft, tier: event.target.value as SpendingTierValue })}
                                className={controlClass}>
                                {SPENDING_TIERS.map((tier) => <option key={tier} value={tier}>{getTierLabel(tier)}</option>)}
                              </select>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => { setEditingId(null); setEditDraft(null); }}
                                  className="min-h-11 px-3 text-xs text-zinc-500">Cancel</button>
                                <button type="button" onClick={() => void saveInlineEdit(expense.id)}
                                  className="min-h-11 rounded-lg bg-zinc-900 px-4 text-xs font-medium text-white">Save</button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <h4 className="min-w-0 flex-1 break-words text-sm">{expense.title}</h4>
                            <p className="shrink-0 font-mono text-sm font-medium">{expense.formattedAmount}</p>
                            <details className="relative shrink-0">
                              <summary aria-label={`Options for ${expense.title}`}
                                className="flex h-11 w-8 cursor-pointer list-none items-center justify-center text-zinc-400 [&::-webkit-details-marker]:hidden">
                                <MoreHorizontal className="h-4 w-4" />
                              </summary>
                              <div className="absolute right-0 top-11 z-10 w-64 space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                                <p className="text-xs text-zinc-500">{expense.category}</p>
                                <p className="text-xs leading-relaxed text-zinc-400">{expense.aiReason}</p>
                                <select aria-label={`Tier for ${expense.title}`} value={expense.tier} disabled={isBusy}
                                  onChange={(event) => void handleQuickTierChange(expense.id, event.target.value as SpendingTierValue)}
                                  className={`${controlClass} w-full`}>
                                  {SPENDING_TIERS.map((tier) => <option key={tier} value={tier}>{getTierLabel(tier)}</option>)}
                                </select>
                                <div className="flex gap-2">
                                  <button type="button" disabled={isBusy} aria-label={`Edit ${expense.title}`}
                                    onClick={() => startEditing(expense)}
                                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-50 text-xs disabled:opacity-40">
                                    <Edit3 className="h-3.5 w-3.5" /> Edit
                                  </button>
                                  <button type="button" disabled={isBusy} aria-label={`Delete ${expense.title}`}
                                    onClick={() => void handleDeleteExpense(expense.id)}
                                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-40">
                                    <Trash2 className="h-3.5 w-3.5" /> Delete
                                  </button>
                                </div>
                              </div>
                            </details>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : (
          <SpendReportPanel expenses={allSnapshot.expenses} today={today} onPeriodChange={revalidateIfStale} />
        )}
      </main>

      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-5"
          role="dialog" aria-modal="true" aria-labelledby="ios-guide-title">
          <div className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 id="ios-guide-title" className="text-sm font-medium">Add to Home Screen</h2>
              <button type="button" aria-label="Close guide" onClick={() => setShowIosGuide(false)} className="p-2 text-zinc-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-zinc-500">
              In Safari, tap Share, then choose Add to Home Screen.
            </p>
            <button type="button" onClick={() => setShowIosGuide(false)}
              className="min-h-11 w-full rounded-xl bg-zinc-900 text-sm text-white">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
