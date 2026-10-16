"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  Filter,
  Layers,
  LayoutGrid,
  LogOut,
  PlusCircle,
  ReceiptText,
  RefreshCw,
  Search,
  Share,
  Smartphone,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
  Wallet,
  X,
} from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";

import { signOut } from "@/features/auth/actions";

import {
  EXPENSE_CATEGORIES,
  formatCompactVnd,
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
  DashboardPeriod,
  DashboardSnapshot,
  SerializedExpense,
} from "@/features/expenses/service";

interface ExpenseDashboardProps {
  readonly initialSnapshot: DashboardSnapshot;
  readonly user?: {
    readonly name: string;
    readonly email: string;
  };
}

type MobileTab = "log" | "insights" | "ledger" | "all";

const EXAMPLE_PROMPTS = [
  "coffee 30k, lunch 50k in VND",
  "phở bò 65k, trà sữa 45k, đổ xăng 100k",
  "electricity bill 850k, gym membership 500k, impulse game skin 180k",
] as const;

const PERIOD_OPTIONS: ReadonlyArray<{ value: DashboardPeriod; label: string }> = [
  { value: "all", label: "All Time" },
  { value: "month", label: "This Month" },
  { value: "30d", label: "30 Days" },
  { value: "7d", label: "7 Days" },
  { value: "today", label: "Today" },
];

function getTierBadgeClasses(tier: SpendingTierValue): string {
  switch (tier) {
    case "MUST_HAVE":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "NICE_TO_HAVE":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "WASTED":
      return "bg-rose-50 text-rose-800 border-rose-200";
  }
}

function getTierDotColor(tier: SpendingTierValue): string {
  switch (tier) {
    case "MUST_HAVE":
      return "bg-emerald-600";
    case "NICE_TO_HAVE":
      return "bg-amber-500";
    case "WASTED":
      return "bg-rose-600";
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
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(initialSnapshot);
  const [period, setPeriod] = useState<DashboardPeriod>(initialSnapshot.period);
  const [mobileTab, setMobileTab] = useState<MobileTab>("log");
  const [showIosGuide, setShowIosGuide] = useState(false);
  const isStandalone = useSyncExternalStore(
    subscribeStandaloneMode,
    getStandaloneModeSnapshot,
    getStandaloneModeServerSnapshot,
  );

  // Input & AI parsing state
  const [rawInput, setRawInput] = useState("");
  const [spentAtDate, setSpentAtDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewItems, setPreviewItems] = useState<ParsedExpenseCandidate[] | null>(null);
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

  async function handlePeriodChange(nextPeriod: DashboardPeriod) {
    setPeriod(nextPeriod);
    try {
      const response = await fetch(`/api/expenses?period=${encodeURIComponent(nextPeriod)}`);
      const data = (await response.json()) as DashboardSnapshot & { error?: string };
      if (response.ok && data.expenses) {
        setSnapshot(data);
      }
    } catch {
      // Keep existing snapshot on network error
    }
  }

  async function handlePreviewParse() {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      setFeedback({
        tone: "error",
        message: 'Please enter spending text first, e.g. "coffee 30k, lunch 50k in VND".',
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
        setFeedback({
          tone: "error",
          message: data.error ?? "Failed to parse expenses.",
        });
        return;
      }

      setPreviewItems(data.items);
      setPreviewModel(data.modelUsed ?? "gemini");
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
        message: 'Please enter spending text first, e.g. "coffee 30k, lunch 50k in VND".',
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
          spentAt: spentAtDate ? new Date(`${spentAtDate}T12:00:00`).toISOString() : undefined,
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

      setSnapshot(data.snapshot);
      setPeriod("all");
      setRawInput("");
      setPreviewItems(null);
      setPreviewModel(null);

      const summaryList = (data.expenses ?? [])
        .map((item) => `${item.title}: ${item.formattedAmount} (${item.tierLabel})`)
        .join(" • ");

      setFeedback({
        tone: "success",
        message: `Logged ${data.expenses?.length ?? 0} item(s) via ${data.modelUsed ?? "AI"}: ${summaryList}`,
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
    setBusyExpenseId(expenseId);
    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: nextTier }),
      });
      const data = (await response.json()) as { snapshot?: DashboardSnapshot; error?: string };
      if (response.ok && data.snapshot) {
        setSnapshot(data.snapshot);
      }
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
    setBusyExpenseId(expenseId);
    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const data = (await response.json()) as { snapshot?: DashboardSnapshot; error?: string };
      if (response.ok && data.snapshot) {
        setSnapshot(data.snapshot);
        setEditingId(null);
        setEditDraft(null);
      }
    } finally {
      setBusyExpenseId(null);
    }
  }

  async function handleDeleteExpense(expenseId: string) {
    setBusyExpenseId(expenseId);
    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { snapshot?: DashboardSnapshot; error?: string };
      if (response.ok && data.snapshot) {
        setSnapshot(data.snapshot);
      }
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
  const maxDailyVnd = Math.max(
    1,
    ...analytics.dailySeries.map((point) => point.totalVnd),
  );

  const showLogSection = mobileTab === "log" || mobileTab === "all";
  const showInsightsSection = mobileTab === "insights" || mobileTab === "all";
  const showLedgerSection = mobileTab === "ledger" || mobileTab === "all";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24 md:pb-10">
      {/* Top Sticky Header with iOS Safe Area Top Padding */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-md pt-safe">
        <div className="mx-auto max-w-7xl px-3.5 py-3 sm:px-6 lg:px-8 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-xs">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                    Self Financial
                  </h1>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 border border-emerald-200">
                    <Sparkles className="h-3 w-3" />
                    Gemini AI
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500">
                  VND Expense Parser • Must have / Nice to have / Wasted
                </p>
              </div>
            </div>

            {/* Mobile Quick Action Buttons (Install Guide + CSV + Sign Out) */}
            <div className="flex items-center gap-1.5 sm:hidden">
              {!isStandalone && (
                <button
                  type="button"
                  onClick={() => setShowIosGuide(true)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 active:scale-95 transition"
                  aria-label="iPhone Home Screen app guide"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  App
                </button>
              )}
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredExpenses.length === 0}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
                aria-label="Export CSV"
              >
                <Download className="h-4 w-4" />
              </button>
              {user && (
                <form action={signOut}>
                  <button
                    type="submit"
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 active:bg-slate-100"
                    aria-label={`Sign out (${user.name})`}
                    title={`Signed in as ${user.name} (${user.email})`}
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Period Selector Strip + Desktop Actions */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto">
            <div
              className="inline-flex w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-100 p-0.5"
              role="group"
              aria-label="Reporting period"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handlePeriodChange(opt.value)}
                  className={`flex-1 sm:flex-initial whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    period === opt.value
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="hidden sm:flex items-center gap-2 shrink-0">
              {!isStandalone && (
                <button
                  type="button"
                  onClick={() => setShowIosGuide(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  iPhone App Guide
                </button>
              )}
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredExpenses.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
              {user && (
                <div className="flex items-center gap-1.5 pl-1 border-l border-slate-200">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 max-w-40 truncate"
                    title={user.email}
                  >
                    <User className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                    <span className="truncate">{user.name}</span>
                  </span>
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* iOS Safari "Add to Home Screen" Guide Modal */}
      {showIosGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-guide-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl space-y-4 mb-safe">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white font-bold">
                  ₫
                </div>
                <div>
                  <h2 id="ios-guide-title" className="text-base font-bold text-slate-900">
                    Use as an iPhone App
                  </h2>
                  <p className="text-xs text-slate-500">
                    Full-screen standalone experience from Safari
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ol className="space-y-3 text-xs text-slate-700">
              <li className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-bold text-white">
                  1
                </span>
                <div>
                  Open this page in <strong>Safari</strong> on your iPhone and tap the{" "}
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
                    <Share className="h-3.5 w-3.5" /> Share
                  </span>{" "}
                  button at the bottom bar.
                </div>
              </li>
              <li className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-bold text-white">
                  2
                </span>
                <div>
                  Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong> (Thêm vào MH chính).
                </div>
              </li>
              <li className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-bold text-white">
                  3
                </span>
                <div>
                  Launch <strong>Self Financial</strong> directly from your Home Screen — it opens full-screen without Safari toolbars, with one-tap VND presets and thumb navigation.
                </div>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="w-full min-h-11 rounded-xl bg-emerald-700 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-3.5 py-4 sm:px-6 sm:py-6 lg:px-8 space-y-5 sm:space-y-6">
        {/* 4 KPI Summary Cards — Compact 2x2 grid on iPhone, 4 columns on desktop */}
        <section
          aria-label="Spending summary metrics"
          className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4"
        >
          {/* Total Spend Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] sm:text-xs font-medium text-slate-500">Total Spend</span>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-medium text-slate-700">
                {analytics.expenseCount} items
              </span>
            </div>
            <p className="mt-1.5 font-mono text-lg sm:text-2xl font-bold text-slate-900 truncate">
              {analytics.totalFormatted}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 truncate">
              Avg/day:{" "}
              <span className="font-mono font-medium text-slate-700">
                {analytics.averageDailyFormatted}
              </span>
            </p>
          </div>

          {/* Must Have Card */}
          <div className="rounded-2xl border border-emerald-200 bg-white p-3.5 sm:p-4 shadow-xs">
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                Must have
              </span>
              <span className="font-mono text-xs font-semibold text-emerald-700">
                {analytics.byTier.MUST_HAVE.percentage}%
              </span>
            </div>
            <p className="mt-1.5 font-mono text-lg sm:text-2xl font-bold text-emerald-900 truncate">
              {analytics.byTier.MUST_HAVE.formattedAmount}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 truncate">
              {analytics.byTier.MUST_HAVE.count} items • &le;60%
            </p>
          </div>

          {/* Nice to Have Card */}
          <div className="rounded-2xl border border-amber-200 bg-white p-3.5 sm:p-4 shadow-xs">
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-amber-800">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Nice to have
              </span>
              <span className="font-mono text-xs font-semibold text-amber-700">
                {analytics.byTier.NICE_TO_HAVE.percentage}%
              </span>
            </div>
            <p className="mt-1.5 font-mono text-lg sm:text-2xl font-bold text-amber-900 truncate">
              {analytics.byTier.NICE_TO_HAVE.formattedAmount}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 truncate">
              {analytics.byTier.NICE_TO_HAVE.count} items • &le;30%
            </p>
          </div>

          {/* Wasted Card */}
          <div
            className={`rounded-2xl border p-3.5 sm:p-4 shadow-xs ${
              analytics.byTier.WASTED.isOverRecommended
                ? "border-rose-300 bg-rose-50/40"
                : "border-rose-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-rose-800">
                <span className="h-2 w-2 rounded-full bg-rose-600" />
                Wasted
              </span>
              <span className="font-mono text-xs font-semibold text-rose-700">
                {analytics.byTier.WASTED.percentage}%
              </span>
            </div>
            <p className="mt-1.5 font-mono text-lg sm:text-2xl font-bold text-rose-900 truncate">
              {analytics.byTier.WASTED.formattedAmount}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 truncate">
              {analytics.byTier.WASTED.count} items • Target &le;10%
            </p>
          </div>
        </section>

        {/* AI Natural-Language Expense Input Section */}
        <section
          aria-labelledby="quick-log-heading"
          className={`${
            showLogSection ? "block" : "hidden md:block"
          } rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs`}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2
                id="quick-log-heading"
                className="text-base font-semibold text-slate-900 flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4 text-emerald-600" />
                Quick Expense Input
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Type or tap presets below (e.g.{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800">
                  coffee 30k, lunch 50k in VND
                </code>
                ). AI parses VND &amp; categorizes automatically.
              </p>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2">
              <label htmlFor="expense-date" className="text-xs font-medium text-slate-600">
                Spend date:
              </label>
              <input
                id="expense-date"
                type="date"
                value={spentAtDate}
                onChange={(e) => setSpentAtDate(e.target.value)}
                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800"
              />
            </div>
          </div>

          {/* One-Tap Habit Presets (Appends items without overwriting) */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                One-Tap Add Item
              </span>
              {rawInput && (
                <button
                  type="button"
                  onClick={() => {
                    setRawInput("");
                    setPreviewItems(null);
                  }}
                  className="text-xs font-medium text-rose-600 hover:text-rose-800"
                >
                  Clear text
                </button>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap">
              {QUICK_EXPENSE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setRawInput((prev) => appendQuickExpenseChip(prev, preset.text));
                    setPreviewItems(null);
                  }}
                  className="shrink-0 min-h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-900 active:scale-95 transition"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleDirectParseAndSave} className="mt-3 space-y-3">
            <div className="relative">
              <textarea
                rows={2}
                value={rawInput}
                enterKeyHint="send"
                onChange={(e) => {
                  setRawInput(e.target.value);
                  if (previewItems) {
                    setPreviewItems(null);
                  }
                }}
                placeholder='e.g. "coffee 30k, lunch 50k in VND" or tap presets above...'
                aria-label="Expense text input"
                className="w-full rounded-xl border border-slate-300 bg-slate-50/60 px-3.5 py-3 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-hidden"
              />
            </div>

            {/* Quick VND Amount Shorthand Helper Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <span className="text-[11px] font-medium text-slate-400 shrink-0 mr-1">
                VND units:
              </span>
              {QUICK_AMOUNT_TOKENS.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => {
                    setRawInput((prev) => appendAmountShorthand(prev, token));
                    setPreviewItems(null);
                  }}
                  className="shrink-0 min-h-8 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 active:scale-95 transition"
                >
                  +{token}
                </button>
              ))}
            </div>

            {/* Full-sentence sample prompts + Submit Buttons */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
              <div className="hidden sm:flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500">Examples:</span>
                {EXAMPLE_PROMPTS.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => {
                      setRawInput(sample);
                      setPreviewItems(null);
                    }}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-800 transition"
                  >
                    {sample}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handlePreviewParse}
                  disabled={isParsing || isSaving}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-98 disabled:opacity-50"
                >
                  {isParsing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  Preview AI Breakdown
                </button>

                <button
                  type="submit"
                  disabled={isSaving || isParsing}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 active:scale-98 disabled:opacity-50"
                >
                  {isSaving ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlusCircle className="h-4 w-4" />
                  )}
                  {previewItems ? `Confirm & Save (${previewItems.length})` : "Parse & Log with AI"}
                </button>
              </div>
            </div>
          </form>

          {/* Feedback Banner */}
          {feedback && (
            <div
              role="status"
              className={`mt-3 flex items-start justify-between gap-3 rounded-xl border px-3.5 py-3 text-xs ${
                feedback.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-rose-200 bg-rose-50 text-rose-900"
              }`}
            >
              <div className="flex items-center gap-2">
                {feedback.tone === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                )}
                <span>{feedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                aria-label="Dismiss message"
                className="p-1 text-slate-500 hover:text-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* AI Preview Breakdown (Mobile Cards + Desktop Table) */}
          {previewItems && previewItems.length > 0 && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/30 p-3.5 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-900">
                    AI Parsed Preview ({previewItems.length} item{previewItems.length === 1 ? "" : "s"})
                  </span>
                  {previewModel && (
                    <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600 border border-slate-200">
                      {previewModel}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewItems(null)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800"
                >
                  Discard preview
                </button>
              </div>

              {/* Mobile Stack Cards for Preview */}
              <div className="space-y-2.5 md:hidden">
                {previewItems.map((item, idx) => (
                  <div
                    key={`${item.title}-${idx}`}
                    className="rounded-xl border border-emerald-200 bg-white p-3 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) =>
                          updatePreviewCandidate(idx, { title: e.target.value })
                        }
                        className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-semibold text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => removePreviewCandidate(idx)}
                        className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                        aria-label="Remove preview item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500">
                          Amount (VND)
                        </label>
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
                          className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-sm text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500">
                          Category
                        </label>
                        <select
                          value={item.category}
                          onChange={(e) =>
                            updatePreviewCandidate(idx, { category: e.target.value })
                          }
                          className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
                        >
                          {EXPENSE_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                      {SPENDING_TIERS.map((t) => {
                        const active = item.tier === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => updatePreviewCandidate(idx, { tier: t })}
                            className={`min-h-9 rounded-lg border text-xs font-semibold transition ${
                              active
                                ? getTierBadgeClasses(t)
                                : "border-transparent text-slate-600"
                            }`}
                          >
                            {getTierLabel(t)}
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-[11px] text-slate-500">
                      Formatted:{" "}
                      <span className="font-mono font-semibold text-slate-800">
                        {item.formattedAmount}
                      </span>{" "}
                      • {item.aiReason}
                    </p>
                  </div>
                ))}
              </div>

              {/* Desktop Table for Preview */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-emerald-200/80 text-slate-600">
                      <th className="pb-2 pr-3 font-medium">Item</th>
                      <th className="pb-2 px-3 font-medium">Parsed Cost (VND)</th>
                      <th className="pb-2 px-3 font-medium">Value Tier</th>
                      <th className="pb-2 px-3 font-medium">Category</th>
                      <th className="pb-2 px-3 font-medium">AI Rationale</th>
                      <th className="pb-2 pl-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-100">
                    {previewItems.map((item, idx) => (
                      <tr key={`${item.title}-${idx}`} className="align-middle">
                        <td className="py-2 pr-3">
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) =>
                              updatePreviewCandidate(idx, { title: e.target.value })
                            }
                            className="w-36 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
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
                              className="w-28 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900"
                            />
                            <span className="font-mono text-xs font-semibold text-emerald-800">
                              ({item.formattedAmount})
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={item.tier}
                            onChange={(e) =>
                              updatePreviewCandidate(idx, {
                                tier: e.target.value as SpendingTierValue,
                              })
                            }
                            className={`rounded-md border px-2 py-1 text-xs font-semibold ${getTierBadgeClasses(
                              item.tier,
                            )}`}
                          >
                            {SPENDING_TIERS.map((t) => (
                              <option key={t} value={t}>
                                {getTierLabel(t)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={item.category}
                            onChange={(e) =>
                              updatePreviewCandidate(idx, { category: e.target.value })
                            }
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                          >
                            {EXPENSE_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3 text-slate-600 max-w-xs">
                          {item.aiReason}
                        </td>
                        <td className="py-2 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => removePreviewCandidate(idx)}
                            className="text-rose-600 hover:text-rose-800 p-1"
                            title="Remove item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Analytics & Insights Grid */}
        <section
          className={`${
            showInsightsSection ? "grid" : "hidden md:grid"
          } grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-12`}
        >
          {/* Left 7 columns: Value Allocation Bar + AI Insights + Daily Trend */}
          <div className="lg:col-span-7 space-y-5 sm:space-y-6">
            {/* Value Allocation & Financial Health Insights */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-emerald-700" />
                  Must have / Nice to have / Wasted Ratio
                </h2>
                <span className="text-xs text-slate-500">
                  Target: 60% / 30% / &le;10%
                </span>
              </div>

              {/* Stacked Progress Bar */}
              <div className="h-4 w-full overflow-hidden rounded-full bg-slate-100 flex">
                {analytics.totalVnd > 0 ? (
                  <>
                    <div
                      style={{ width: `${analytics.byTier.MUST_HAVE.percentage}%` }}
                      className="bg-emerald-600 transition-all"
                      title={`Must have: ${analytics.byTier.MUST_HAVE.formattedAmount} (${analytics.byTier.MUST_HAVE.percentage}%)`}
                    />
                    <div
                      style={{ width: `${analytics.byTier.NICE_TO_HAVE.percentage}%` }}
                      className="bg-amber-500 transition-all"
                      title={`Nice to have: ${analytics.byTier.NICE_TO_HAVE.formattedAmount} (${analytics.byTier.NICE_TO_HAVE.percentage}%)`}
                    />
                    <div
                      style={{ width: `${analytics.byTier.WASTED.percentage}%` }}
                      className="bg-rose-600 transition-all"
                      title={`Wasted: ${analytics.byTier.WASTED.formattedAmount} (${analytics.byTier.WASTED.percentage}%)`}
                    />
                  </>
                ) : (
                  <div className="w-full bg-slate-200" />
                )}
              </div>

              {/* Legend */}
              <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                {SPENDING_TIERS.map((t) => {
                  const tierInfo = analytics.byTier[t];
                  return (
                    <div
                      key={t}
                      className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5"
                    >
                      <div className="flex items-center gap-1.5 font-medium text-slate-700">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${getTierDotColor(t)}`} />
                        <span className="truncate">{tierInfo.label}</span>
                      </div>
                      <div className="mt-1 font-mono font-semibold text-slate-900 truncate">
                        {tierInfo.formattedAmount}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {tierInfo.percentage}% ({tierInfo.count})
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actionable Insights */}
              <div className="space-y-2 pt-1">
                {analytics.insights.map((insight) => (
                  <div
                    key={insight.id}
                    className={`rounded-xl border px-3.5 py-2.5 text-xs ${
                      insight.tone === "danger"
                        ? "border-rose-200 bg-rose-50/70 text-rose-900"
                        : insight.tone === "warning"
                          ? "border-amber-200 bg-amber-50/70 text-amber-900"
                          : insight.tone === "good"
                            ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                            : "border-slate-200 bg-slate-50 text-slate-800"
                    }`}
                  >
                    <p className="font-semibold">{insight.title}</p>
                    <p className="mt-0.5 opacity-90">{insight.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Daily Spending Trend */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-700" />
                  Daily Spending Breakdown
                </h2>
                <span className="text-xs text-slate-500">
                  {analytics.dailySeries.length} active day(s)
                </span>
              </div>

              {analytics.dailySeries.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  No daily spending data yet. Log an expense above to populate the trend chart.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {analytics.dailySeries
                    .slice(-10)
                    .reverse()
                    .map((day) => {
                      const widthPct = Math.max(4, Math.round((day.totalVnd / maxDailyVnd) * 100));
                      const mustShare =
                        day.totalVnd > 0 ? (day.mustHaveVnd / day.totalVnd) * 100 : 0;
                      const niceShare =
                        day.totalVnd > 0 ? (day.niceToHaveVnd / day.totalVnd) * 100 : 0;
                      const wastedShare =
                        day.totalVnd > 0 ? (day.wastedVnd / day.totalVnd) * 100 : 0;

                      return (
                        <div key={day.date} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-medium text-slate-700">
                              {day.date}
                            </span>
                            <span className="font-mono font-semibold text-slate-900">
                              {formatVnd(day.totalVnd)}{" "}
                              <span className="font-sans font-normal text-slate-500">
                                ({day.count} item{day.count === 1 ? "" : "s"})
                              </span>
                            </span>
                          </div>
                          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              style={{ width: `${widthPct}%` }}
                              className="flex h-full overflow-hidden rounded-full"
                            >
                              <div
                                style={{ width: `${mustShare}%` }}
                                className="bg-emerald-600"
                                title={`Must have: ${formatCompactVnd(day.mustHaveVnd)}`}
                              />
                              <div
                                style={{ width: `${niceShare}%` }}
                                className="bg-amber-500"
                                title={`Nice to have: ${formatCompactVnd(day.niceToHaveVnd)}`}
                              />
                              <div
                                style={{ width: `${wastedShare}%` }}
                                className="bg-rose-600"
                                title={`Wasted: ${formatCompactVnd(day.wastedVnd)}`}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>

          {/* Right 5 columns: Category Breakdown & Recent AI Input Batches */}
          <div className="lg:col-span-5 space-y-5 sm:space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-700" />
                  Spend by Category
                </h2>
                <span className="text-xs text-slate-500">
                  {analytics.byCategory.length} categories
                </span>
              </div>

              {analytics.byCategory.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Categories will appear here once expenses are logged.
                </p>
              ) : (
                <div className="space-y-3">
                  {analytics.byCategory.map((cat) => (
                    <div key={cat.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">{cat.category}</span>
                          <span
                            className={`rounded border px-1.5 py-0.2 text-[10px] font-medium ${getTierBadgeClasses(
                              cat.dominantTier,
                            )}`}
                          >
                            {getTierLabel(cat.dominantTier)}
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-slate-900">
                          {cat.formattedAmount} ({cat.percentage}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          style={{ width: `${Math.max(3, cat.percentage)}%` }}
                          className={`h-full rounded-full ${getTierDotColor(cat.dominantTier)}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent AI Input Batches */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Recent Natural-Language Prompts
              </h2>
              {snapshot.recentBatches.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Your recent text inputs will be listed here for quick reuse.
                </p>
              ) : (
                <div className="space-y-2">
                  {snapshot.recentBatches.slice(0, 5).map((batch) => (
                    <button
                      key={batch.id}
                      type="button"
                      onClick={() => {
                        setRawInput(batch.rawInput);
                        setMobileTab("log");
                      }}
                      className="w-full text-left rounded-xl border border-slate-100 bg-slate-50 hover:border-emerald-200 hover:bg-emerald-50/30 px-3 py-2.5 text-xs flex items-center justify-between gap-2 transition"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-slate-800">
                          &ldquo;{batch.rawInput}&rdquo;
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {batch.itemCount} item(s) • {batch.aiModel} • Tap to reuse
                        </p>
                      </div>
                      <span className="shrink-0 font-mono font-semibold text-slate-900">
                        {batch.totalFormatted}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Expense Ledger Section (Mobile Cards + Desktop Table) */}
        <section
          aria-labelledby="ledger-heading"
          className={`${
            showLedgerSection ? "block" : "hidden md:block"
          } rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="ledger-heading" className="text-base font-semibold text-slate-900">
                Expense Ledger &amp; Value Audit
              </h2>
              <p className="text-xs text-slate-500">
                Tap <span className="font-medium">Must have</span>,{" "}
                <span className="font-medium">Nice to have</span>, or{" "}
                <span className="font-medium">Wasted</span> on any item to reclassify immediately.
              </p>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
              <div className="inline-flex overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setTierFilter("ALL")}
                  className={`flex-1 sm:flex-initial whitespace-nowrap rounded-lg px-2.5 py-1.5 font-semibold ${
                    tierFilter === "ALL"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  All ({snapshot.expenses.length})
                </button>
                {SPENDING_TIERS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTierFilter(t)}
                    className={`flex-1 sm:flex-initial whitespace-nowrap rounded-lg px-2.5 py-1.5 font-semibold ${
                      tierFilter === t
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {getTierLabel(t)} ({analytics.byTier[t].count})
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:flex items-center gap-2">
                <div className="relative flex items-center">
                  <Filter className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
                  <select
                    aria-label="Filter by category"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full min-h-9 rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-700"
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
                  <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search..."
                    aria-label="Search expenses"
                    className="w-full min-h-9 rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">No expenses match your view</p>
              <p className="mt-1 text-xs text-slate-500">
                Try logging{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                  coffee 30k, lunch 50k in VND
                </code>{" "}
                above.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile-First Card List (iPhone View) */}
              <div className="space-y-3 md:hidden" data-testid="mobile-expense-list">
                {filteredExpenses.map((expense) => {
                  const isEditing = editingId === expense.id && editDraft !== null;
                  const isBusy = busyExpenseId === expense.id;

                  return (
                    <article
                      key={expense.id}
                      className={`rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-3 transition ${
                        isBusy ? "opacity-50" : ""
                      }`}
                    >
                      {isEditing ? (
                        <div className="space-y-2.5">
                          <input
                            type="text"
                            value={editDraft.title}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, title: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
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
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
                            />
                            <select
                              value={editDraft.category}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, category: e.target.value })
                              }
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
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
                              className="min-h-10 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => saveInlineEdit(expense.id)}
                              className="min-h-10 rounded-xl bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white"
                            >
                              Save Changes
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-bold text-slate-900">
                                  {expense.title}
                                </h3>
                                <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  {expense.category}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                                {expense.aiReason}
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <p className="font-mono text-base font-bold text-slate-900">
                                {expense.formattedAmount}
                              </p>
                              <p className="font-mono text-[11px] text-slate-400">
                                {expense.spentAt.slice(0, 10)}
                              </p>
                            </div>
                          </div>

                          {/* Thumb-friendly Segmented Control + Actions */}
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <div className="grid flex-1 grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1">
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
                                    className={`min-h-9 rounded-lg border text-[11px] font-semibold transition ${
                                      active
                                        ? getTierBadgeClasses(t)
                                        : "border-transparent text-slate-600"
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
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 active:bg-slate-100"
                                aria-label={`Edit ${expense.title}`}
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteExpense(expense.id)}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-rose-600 active:bg-rose-50"
                                aria-label={`Delete ${expense.title}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>

              {/* Desktop Data Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="pb-2.5 pr-3 font-medium">Expense &amp; AI Note</th>
                      <th className="pb-2.5 px-3 font-medium">Cost (VND)</th>
                      <th className="pb-2.5 px-3 font-medium">Value Category</th>
                      <th className="pb-2.5 px-3 font-medium">Domain</th>
                      <th className="pb-2.5 px-3 font-medium">Date</th>
                      <th className="pb-2.5 pl-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredExpenses.map((expense) => {
                      const isEditing = editingId === expense.id && editDraft !== null;
                      const isBusy = busyExpenseId === expense.id;

                      return (
                        <tr
                          key={expense.id}
                          className={`hover:bg-slate-50/80 transition ${
                            isBusy ? "opacity-50" : ""
                          }`}
                        >
                          <td className="py-3 pr-3">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editDraft.title}
                                onChange={(e) =>
                                  setEditDraft({ ...editDraft, title: e.target.value })
                                }
                                className="w-44 rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-900"
                              />
                            ) : (
                              <div>
                                <p className="font-semibold text-slate-900 text-sm">
                                  {expense.title}
                                </p>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {expense.aiReason}
                                </p>
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
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
                                className="w-28 rounded border border-slate-300 px-2 py-1 font-mono text-xs text-slate-900"
                              />
                            ) : (
                              <span className="font-mono text-sm font-bold text-slate-900">
                                {expense.formattedAmount}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <div className="inline-flex items-center gap-1">
                              {SPENDING_TIERS.map((t) => {
                                const active = (isEditing ? editDraft.tier : expense.tier) === t;
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
                                    className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition ${
                                      active
                                        ? getTierBadgeClasses(t)
                                        : "border-transparent text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                    }`}
                                  >
                                    {getTierLabel(t)}
                                  </button>
                                );
                              })}
                            </div>
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            {isEditing ? (
                              <select
                                value={editDraft.category}
                                onChange={(e) =>
                                  setEditDraft({ ...editDraft, category: e.target.value })
                                }
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                              >
                                {EXPENSE_CATEGORIES.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                                {expense.category}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap font-mono text-xs text-slate-500">
                            {expense.spentAt.slice(0, 10)}
                          </td>

                          <td className="py-3 pl-3 text-right whitespace-nowrap">
                            {isEditing ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => saveInlineEdit(expense.id)}
                                  className="rounded bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingId(null);
                                    setEditDraft(null);
                                  }}
                                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => startEditing(expense)}
                                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                  title="Edit expense"
                                  aria-label={`Edit ${expense.title}`}
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExpense(expense.id)}
                                  className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
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
      </main>

      {/* iPhone Thumb-Reachable Bottom Tab Navigation (Mobile Only) */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe md:hidden"
      >
        <div className="grid grid-cols-4 px-2 py-1">
          <button
            type="button"
            onClick={() => setMobileTab("log")}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition ${
              mobileTab === "log"
                ? "text-emerald-700 bg-emerald-50/70"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <PlusCircle className="h-5 w-5" />
            <span>Quick Log</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab("insights")}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition ${
              mobileTab === "insights"
                ? "text-emerald-700 bg-emerald-50/70"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <BarChart3 className="h-5 w-5" />
            <span>Analytics</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab("ledger")}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition ${
              mobileTab === "ledger"
                ? "text-emerald-700 bg-emerald-50/70"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <ReceiptText className="h-5 w-5" />
            <span>Ledger ({snapshot.expenses.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab("all")}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition ${
              mobileTab === "all"
                ? "text-emerald-700 bg-emerald-50/70"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <LayoutGrid className="h-5 w-5" />
            <span>Full View</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
