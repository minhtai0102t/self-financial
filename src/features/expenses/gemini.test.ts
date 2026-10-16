import { describe, expect, it, vi } from "vitest";

import { parseExpensesWithGemini } from "@/features/expenses/gemini";

describe("parseExpensesWithGemini", () => {
  it("rotates to the next API key when the first key returns 429 or 503", async () => {
    const calls: string[] = [];
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url);
      calls.push(urlStr);
      if (urlStr.includes("key=bad-key")) {
        return new Response(JSON.stringify({ error: { code: 503, message: "Overloaded" } }), {
          status: 503,
        });
      }
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      items: [
                        {
                          title: "Coffee",
                          amountVnd: 30000,
                          tier: "NICE_TO_HAVE",
                          category: "Food & Drink",
                          aiReason: "Daily coffee treat is a nice-to-have comfort expense.",
                        },
                        {
                          title: "Lunch",
                          amountVnd: 50000,
                          tier: "MUST_HAVE",
                          category: "Food & Drink",
                          aiReason: "Lunch is an essential daily meal.",
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const result = await parseExpensesWithGemini("coffee 30k, lunch 50k in VND", {
      apiKeys: ["bad-key", "good-key"],
      models: ["gemini-3.7-flash"],
      fetchImpl: mockFetch as unknown as typeof fetch,
      forceAi: true,
    });

    expect(calls.length).toBe(2);
    expect(calls[0]).toContain("key=bad-key");
    expect(calls[1]).toContain("key=good-key");
    expect(result.usedFallback).toBe(false);
    expect(result.modelUsed).toBe("gemini-3.7-flash");
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      title: "Coffee",
      amountVnd: 30_000,
      formattedAmount: "30.000 VND",
      tier: "NICE_TO_HAVE",
    });
    expect(result.items[1]).toMatchObject({
      title: "Lunch",
      amountVnd: 50_000,
      formattedAmount: "50.000 VND",
      tier: "MUST_HAVE",
    });
  });

  it("falls back to deterministic local parser when all Gemini requests fail", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response("Service unavailable", { status: 503 });
    });

    const result = await parseExpensesWithGemini("coffee 30k, lunch 50k in VND", {
      apiKeys: ["key-1"],
      models: ["gemini-3.7-flash"],
      fetchImpl: mockFetch as unknown as typeof fetch,
      forceAi: true,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.modelUsed).toBe("local-fallback");
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.amountVnd).toBe(30_000);
    expect(result.items[1]?.amountVnd).toBe(50_000);
  });

  it("skips calling Gemini API when all items are high-confidence local matches", async () => {
    const mockFetch = vi.fn();

    const result = await parseExpensesWithGemini("coffee 30k, lunch 50k in VND", {
      apiKeys: ["key-1", "key-2"],
      models: ["gemini-3.7-flash"],
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.usedFallback).toBe(false);
    expect(result.modelUsed).toBe("smart-local-rules");
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      title: "Coffee",
      amountVnd: 30_000,
      tier: "NICE_TO_HAVE",
    });
    expect(result.items[1]).toMatchObject({
      title: "Lunch",
      amountVnd: 50_000,
      tier: "MUST_HAVE",
    });
  });

  it("calls Gemini API when input contains an ambiguous item and caches repeated prompts", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      items: [
                        {
                          title: "Mystery Gadget",
                          amountVnd: 420000,
                          tier: "WASTED",
                          category: "Shopping",
                          aiReason: "Unplanned novelty item classified as wasted.",
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const first = await parseExpensesWithGemini("mystery item xyz 420k", {
      apiKeys: ["key-a"],
      models: ["gemini-3.7-flash"],
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const second = await parseExpensesWithGemini("mystery item xyz 420k", {
      apiKeys: ["key-a"],
      models: ["gemini-3.7-flash"],
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(first.modelUsed).toBe("gemini-3.7-flash");
    expect(second.modelUsed).toBe("gemini-3.7-flash (cached)");
    expect(second.items[0]?.tier).toBe("WASTED");
  });
});
