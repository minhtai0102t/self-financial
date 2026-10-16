export interface QuickExpensePreset {
  readonly label: string;
  readonly text: string;
}

export const QUICK_EXPENSE_PRESETS: readonly QuickExpensePreset[] = [
  { label: "☕ Coffee 30k", text: "coffee 30k" },
  { label: "🍜 Lunch 50k", text: "lunch 50k" },
  { label: "🍲 Dinner 70k", text: "dinner 70k" },
  { label: "🧋 Boba 45k", text: "trà sữa 45k" },
  { label: "🛵 Grab 35k", text: "grab bike 35k" },
  { label: "⛽ Fuel 100k", text: "đổ xăng 100k" },
  { label: "🛒 Groceries 250k", text: "groceries 250k" },
  { label: "🎮 Impulse 150k", text: "impulse game topup 150k" },
] as const;

export const QUICK_AMOUNT_TOKENS = [
  "k",
  "tr",
  "20k",
  "30k",
  "50k",
  "100k",
  "200k",
  "500k",
] as const;

/**
 * Appends a full expense preset (e.g. "lunch 50k") into the current input box,
 * automatically adding a comma separator if the user already has items typed.
 */
export function appendQuickExpenseChip(currentInput: string, presetText: string): string {
  const trimmedCurrent = currentInput.trim();
  const trimmedPreset = presetText.trim();
  if (!trimmedCurrent) {
    return trimmedPreset;
  }

  const withoutTrailingComma = trimmedCurrent.replace(/[,;\s]+$/, "");
  return `${withoutTrailingComma}, ${trimmedPreset}`;
}

/**
 * Appends an amount shorthand or unit (e.g. "30k", "50k", "k", "tr") onto the current input.
 * - If the token is a unit ("k" or "tr") and the current input ends with a digit, attaches directly ("coffee 30" -> "coffee 30k").
 * - Otherwise appends with a space ("phở bò" -> "phở bò 65k").
 */
export function appendAmountShorthand(currentInput: string, token: string): string {
  const trimmedCurrent = currentInput.trimEnd();
  const cleanToken = token.trim();
  if (!trimmedCurrent) {
    return cleanToken;
  }

  if ((cleanToken === "k" || cleanToken === "tr") && /\d$/.test(trimmedCurrent)) {
    return `${trimmedCurrent}${cleanToken}`;
  }

  return `${trimmedCurrent} ${cleanToken}`;
}
