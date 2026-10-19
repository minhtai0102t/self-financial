import { z } from "zod";

import {
  formatVnd,
  normalizeSpendingTier,
  type SpendingTierValue,
} from "@/features/expenses/format";
import {
  isHighConfidenceLocalParse,
  type ParsedExpenseCandidate,
  parseExpenseTextLocally,
} from "@/features/expenses/parser";

export const DEFAULT_GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
] as const;

export const DEFAULT_GEMINI_TIMEOUT_MS = 3_500;
export const DEFAULT_MAX_GEMINI_ATTEMPTS = 3;

const geminiItemSchema = z.object({
  title: z.string().min(1),
  amountVnd: z.number().int().positive(),
  tier: z.string(),
  category: z.string().min(1),
  aiReason: z.string().min(1),
});

const geminiResponsePayloadSchema = z.object({
  items: z.array(geminiItemSchema).min(1),
});

export interface GeminiParseResult {
  readonly rawInput: string;
  readonly items: ParsedExpenseCandidate[];
  readonly modelUsed: string;
  readonly usedFallback: boolean;
}

export interface GeminiParseOptions {
  readonly apiKeys?: readonly string[];
  readonly models?: readonly string[];
  readonly fetchImpl?: typeof fetch;
  /** When true, bypasses the local high-confidence short-circuit and forces a Gemini API call. */
  readonly forceAi?: boolean;
  /** Optional pre-enriched local candidates (e.g. enriched from user's database history). */
  readonly preEnrichedItems?: readonly ParsedExpenseCandidate[];
  /** Per-request timeout in milliseconds (defaults to 3,500ms). */
  readonly timeoutMs?: number;
  /** Maximum total remote HTTP attempts before falling back to local parsing (defaults to 3). */
  readonly maxAttempts?: number;
}

const MAX_PROMPT_CACHE_SIZE = 100;
const promptParseCache = new Map<string, GeminiParseResult>();
const unavailableModels = new Set<string>();
let keyRotationCursor = 0;

export function clearGeminiParseCache(): void {
  promptParseCache.clear();
  unavailableModels.clear();
}

function getCacheKey(rawInput: string): string {
  return rawInput.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildSystemInstruction(): string {
  return [
    "You are an expert Vietnamese & English personal finance AI assistant.",
    "Parse the user's raw spending text into individual expense items denominated in Vietnamese Dong (VND).",
    "Rules for parsing amountVnd:",
    "- 'k', 'nghìn', 'ngàn', 'cành' = multiply by 1,000 (e.g., '30k' -> 30000, '50k' -> 50000).",
    "- 'tr', 'triệu', 'm' = multiply by 1,000,000 (e.g., '1.5tr' or '1tr5' -> 1500000).",
    "- '30.000' or '30,000' in VND = 30000.",
    "- Always return amountVnd as a positive integer in VND.",
    "Rules for categorizing tier (MUST_HAVE, NICE_TO_HAVE, WASTED):",
    "- MUST_HAVE: Essential living costs — daily meals (breakfast, lunch, dinner, cơm, phở, bún), groceries, rent, electricity/water/internet bills, commuting/fuel/Grab to work, healthcare/medicine.",
    "- NICE_TO_HAVE: Reasonable comfort & lifestyle spending — coffee, café, milk tea/boba, snacks, dining out treats, movies, Netflix/Spotify, books, gym, clothes, gifts.",
    "- WASTED: Regretful or unproductive spending — impulse shopping, unused subscriptions, gambling/betting/gacha top-ups, preventable late fees/fines, cigarettes/vape, overpriced traps.",
    "Rules for category:",
    "- Pick one of: 'Food & Drink', 'Transport', 'Bills & Utilities', 'Housing', 'Shopping', 'Entertainment', 'Health', 'Education', 'Other'.",
    "Return strictly valid JSON matching: { \"items\": [{ \"title\": string, \"amountVnd\": number, \"tier\": \"MUST_HAVE\" | \"NICE_TO_HAVE\" | \"WASTED\", \"category\": string, \"aiReason\": string }] }.",
  ].join("\n");
}

function extractJsonFromGeminiText(rawText: string): unknown {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  return JSON.parse(candidate);
}

/**
 * Parses natural-language expense text using Google Gemini AI with automatic API key rotation
 * and model fallback, falling back to deterministic local parsing if all remote attempts fail.
 */
export async function parseExpensesWithGemini(
  rawInput: string,
  options?: GeminiParseOptions,
): Promise<GeminiParseResult> {
  const trimmedInput = rawInput.trim();
  if (!trimmedInput) {
    return {
      rawInput: trimmedInput,
      items: [],
      modelUsed: "none",
      usedFallback: true,
    };
  }

  const localItems = options?.preEnrichedItems
    ? [...options.preEnrichedItems]
    : parseExpenseTextLocally(trimmedInput);

  // Tier 1 & 2: If every item is already resolved with high confidence via local rules or DB history,
  // skip the external Gemini network call unless forceAi is explicitly requested.
  if (!options?.forceAi && isHighConfidenceLocalParse(trimmedInput, localItems)) {
    return {
      rawInput: trimmedInput,
      items: localItems,
      modelUsed: "smart-local-rules",
      usedFallback: false,
    };
  }

  // Tier 3: In-memory LRU prompt cache to avoid duplicate Gemini calls for identical inputs
  const cacheKey = getCacheKey(trimmedInput);
  if (!options?.forceAi) {
    const cached = promptParseCache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        rawInput: trimmedInput,
        modelUsed: cached.modelUsed.endsWith("(cached)")
          ? cached.modelUsed
          : `${cached.modelUsed} (cached)`,
      };
    }
  }

  const apiKeys =
    options?.apiKeys ??
    (process.env.GEMINI_API_KEYS ?? process.env.NEXT_PUBLIC_GEMINI_API_KEYS ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

  const models = options?.models ?? DEFAULT_GEMINI_MODELS;
  const fetchFn = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS;
  const maxAttempts = Math.max(1, options?.maxAttempts ?? DEFAULT_MAX_GEMINI_ATTEMPTS);

  if (apiKeys.length === 0) {
    return {
      rawInput: trimmedInput,
      items: localItems,
      modelUsed: "local-fallback",
      usedFallback: true,
    };
  }

  // Advance round-robin starting index so traffic is distributed evenly across all configured keys
  const startKeyIndex = keyRotationCursor % apiKeys.length;
  keyRotationCursor = (keyRotationCursor + 1) % apiKeys.length;

  const requestPayload = JSON.stringify({
    systemInstruction: {
      parts: [{ text: buildSystemInstruction() }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: trimmedInput }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  let attempts = 0;

  for (const model of models) {
    if (!options?.models && unavailableModels.has(model)) {
      continue;
    }

    for (let offset = 0; offset < apiKeys.length; offset++) {
      if (attempts >= maxAttempts) {
        break;
      }
      attempts++;

      const apiKey = apiKeys[(startKeyIndex + offset) % apiKeys.length]!;
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      try {
        const response = await fetchFn(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestPayload,
          ...(typeof AbortSignal !== "undefined" && "timeout" in AbortSignal && timeoutMs > 0
            ? { signal: AbortSignal.timeout(timeoutMs) }
            : {}),
        });

        if (response.status === 404) {
          // 404 indicates the model endpoint itself does not exist; rotating API keys on the same model is pointless.
          if (!options?.models) {
            unavailableModels.add(model);
          }
          break;
        }

        if (!response.ok) {
          continue;
        }

        const body = (await response.json()) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>;
            };
          }>;
        };

        const textPart = body.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          .trim();

        if (!textPart) {
          continue;
        }

        const parsedJson = extractJsonFromGeminiText(textPart);
        const validated = geminiResponsePayloadSchema.safeParse(parsedJson);
        if (!validated.success) {
          continue;
        }

        const normalizedItems: ParsedExpenseCandidate[] = validated.data.items.map((item) => {
          const tier: SpendingTierValue = normalizeSpendingTier(item.tier);
          return {
            title: item.title.trim(),
            amountVnd: item.amountVnd,
            formattedAmount: formatVnd(item.amountVnd),
            currency: "VND",
            tier,
            category: item.category.trim(),
            aiReason: item.aiReason.trim(),
            confidence: "high",
          };
        });

        const result: GeminiParseResult = {
          rawInput: trimmedInput,
          items: normalizedItems,
          modelUsed: model,
          usedFallback: false,
        };

        if (promptParseCache.size >= MAX_PROMPT_CACHE_SIZE) {
          const oldestKey = promptParseCache.keys().next().value;
          if (oldestKey !== undefined) {
            promptParseCache.delete(oldestKey);
          }
        }
        promptParseCache.set(cacheKey, result);

        return result;
      } catch {
        // Rotate to the next API key / model
        continue;
      }
    }
  }

  return {
    rawInput: trimmedInput,
    items: localItems,
    modelUsed: "local-fallback",
    usedFallback: true,
  };
}
