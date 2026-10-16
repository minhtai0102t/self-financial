import { describe, expect, it } from "vitest";

import {
  appendAmountShorthand,
  appendQuickExpenseChip,
  QUICK_AMOUNT_TOKENS,
  QUICK_EXPENSE_PRESETS,
} from "@/features/expenses/quick-input";

describe("appendQuickExpenseChip", () => {
  it("sets input when current input is empty", () => {
    expect(appendQuickExpenseChip("", "coffee 30k")).toBe("coffee 30k");
  });

  it("appends with comma when current input already has a complete item", () => {
    expect(appendQuickExpenseChip("coffee 30k", "lunch 50k")).toBe(
      "coffee 30k, lunch 50k",
    );
  });

  it("does not duplicate trailing commas when appending", () => {
    expect(appendQuickExpenseChip("coffee 30k, ", "grab 35k")).toBe(
      "coffee 30k, grab 35k",
    );
  });
});

describe("appendAmountShorthand", () => {
  it("attaches an amount token with a space after an item name without amount", () => {
    expect(appendAmountShorthand("phở bò", "65k")).toBe("phở bò 65k");
  });

  it("attaches k or tr unit directly onto a trailing bare number", () => {
    expect(appendAmountShorthand("coffee 30", "k")).toBe("coffee 30k");
    expect(appendAmountShorthand("rent 5", "tr")).toBe("rent 5tr");
  });

  it("exposes curated mobile presets and amount tokens", () => {
    expect(QUICK_EXPENSE_PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(QUICK_AMOUNT_TOKENS).toContain("30k");
    expect(QUICK_AMOUNT_TOKENS).toContain("50k");
  });
});
