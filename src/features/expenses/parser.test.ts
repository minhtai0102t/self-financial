import { describe, expect, it } from "vitest";

import { parseAmountVnd, parseExpenseTextLocally } from "@/features/expenses/parser";

describe("parseAmountVnd", () => {
  it("parses k/nghìn/ngàn shorthand into VND integers", () => {
    expect(parseAmountVnd("30k")).toBe(30_000);
    expect(parseAmountVnd("50k in VND")).toBe(50_000);
    expect(parseAmountVnd("45.5k")).toBe(45_500);
    expect(parseAmountVnd("120 nghìn")).toBe(120_000);
    expect(parseAmountVnd("85 ngàn")).toBe(85_000);
  });

  it("parses triệu/tr/m shorthand and dot/comma formatted VND numbers", () => {
    expect(parseAmountVnd("1.5tr")).toBe(1_500_000);
    expect(parseAmountVnd("1tr5")).toBe(1_500_000);
    expect(parseAmountVnd("2 triệu")).toBe(2_000_000);
    expect(parseAmountVnd("30.000 VND")).toBe(30_000);
    expect(parseAmountVnd("50.000đ")).toBe(50_000);
    expect(parseAmountVnd("1,250,000 vnd")).toBe(1_250_000);
  });
});

describe("parseExpenseTextLocally", () => {
  it("parses 'coffee 30k, lunch 50k in VND' into 30.000 VND and 50.000 VND with proper tiers", () => {
    const items = parseExpenseTextLocally("coffee 30k, lunch 50k in VND");

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Coffee",
      amountVnd: 30_000,
      formattedAmount: "30.000 VND",
      tier: "NICE_TO_HAVE",
      category: "Food & Drink",
    });
    expect(items[1]).toMatchObject({
      title: "Lunch",
      amountVnd: 50_000,
      formattedAmount: "50.000 VND",
      tier: "MUST_HAVE",
      category: "Food & Drink",
    });
  });

  it("classifies essential, lifestyle, and wasted expenses accurately", () => {
    const items = parseExpenseTextLocally(
      "electricity bill 850k, boba tea 55k, impulse gacha game topup 300k",
    );

    expect(items).toHaveLength(3);
    expect(items[0]?.tier).toBe("MUST_HAVE");
    expect(items[0]?.amountVnd).toBe(850_000);
    expect(items[1]?.tier).toBe("NICE_TO_HAVE");
    expect(items[1]?.amountVnd).toBe(55_000);
    expect(items[2]?.tier).toBe("WASTED");
    expect(items[2]?.amountVnd).toBe(300_000);
  });
});
