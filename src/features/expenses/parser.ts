import {
  formatVnd,
  type SpendingTierValue,
} from "@/features/expenses/format";

export interface ParsedExpenseCandidate {
  readonly title: string;
  readonly amountVnd: number;
  readonly formattedAmount: string;
  readonly currency: "VND";
  readonly tier: SpendingTierValue;
  readonly category: string;
  readonly aiReason: string;
  readonly confidence?: "high" | "low";
}

/**
 * Parses a Vietnamese/English currency token or phrase into an integer VND amount.
 * Examples:
 * - "30k" -> 30000
 * - "50k in VND" -> 50000
 * - "1.5tr" / "1tr5" -> 1500000
 * - "30.000 VND" / "50,000đ" -> 30000 / 50000
 */
export function parseAmountVnd(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  // Compound million shorthand: e.g. "1tr5", "2m3" -> 1.500.000, 2.300.000
  const compoundMillionMatch = text.match(
    /(\d+)\s*(?:tr|triệu|trieu|m)\s*(\d{1,3})\b/i,
  );
  if (compoundMillionMatch?.[1] && compoundMillionMatch[2]) {
    const millions = Number.parseInt(compoundMillionMatch[1], 10);
    const fractionDigits = compoundMillionMatch[2];
    const fraction =
      Number.parseInt(fractionDigits, 10) * Math.pow(10, 6 - fractionDigits.length);
    return millions * 1_000_000 + fraction;
  }

  // Decimal/integer million shorthand: e.g. "1.5tr", "2,5 triệu", "2m"
  const millionMatch = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:tr|triệu|trieu|m|million)\b/i,
  );
  if (millionMatch?.[1]) {
    const value = Number.parseFloat(millionMatch[1].replace(",", "."));
    if (Number.isFinite(value) && value > 0) {
      return Math.round(value * 1_000_000);
    }
  }

  // Thousand shorthand: e.g. "30k", "45.5k", "120 nghìn", "85 ngàn", "50 cành"
  const thousandMatch = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:k|nghìn|nghin|ngàn|ngan|cành|canh)\b/i,
  );
  if (thousandMatch?.[1]) {
    const value = Number.parseFloat(thousandMatch[1].replace(",", "."));
    if (Number.isFinite(value) && value > 0) {
      return Math.round(value * 1_000);
    }
  }

  // Grouped thousands with dots or commas: e.g. "30.000", "1.250.000", "50,000"
  const groupedMatch = text.match(
    /\b(\d{1,3}(?:[.,]\d{3})+)\s*(?:vnd|vnđ|đ|d|đồng|dong)?\b/i,
  );
  if (groupedMatch?.[1]) {
    const digitsOnly = groupedMatch[1].replace(/[.,]/g, "");
    const value = Number.parseInt(digitsOnly, 10);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  // Plain integer amount: e.g. "30000", "50000 vnd", or bare shorthand like "30" when >= 1000 or < 1000
  const plainMatch = text.match(/\b(\d+)\s*(?:vnd|vnđ|đ|d|đồng|dong)?\b/i);
  if (plainMatch?.[1]) {
    const value = Number.parseInt(plainMatch[1], 10);
    if (Number.isFinite(value) && value > 0) {
      // If someone writes a small number like "30" or "50" in a VND context, treat < 1000 as thousands
      return value < 1_000 ? value * 1_000 : value;
    }
  }

  return null;
}

interface RuleClassification {
  readonly tier: SpendingTierValue;
  readonly category: string;
  readonly aiReason: string;
  readonly confidence: "high" | "low";
}

const WASTED_KEYWORDS = [
  "impulse",
  "wasted",
  "waste",
  "regret",
  "unnecessary",
  "gacha",
  "casino",
  "bet",
  "betting",
  "lottery",
  "vé số",
  "nạp game",
  "skin game",
  "fine",
  "late fee",
  "phạt",
  "cigarette",
  "thuốc lá",
  "vape",
  "pod",
  "unused",
  "forgot to cancel",
  "phí tiền",
  "mua đại",
  "mua bừa",
  "overpriced",
  "scam",
];

const NICE_TO_HAVE_KEYWORDS: ReadonlyArray<{ keywords: readonly string[]; category: string; reason: string }> = [
  {
    keywords: [
      "coffee",
      "cafe",
      "cà phê",
      "ca phe",
      "starbucks",
      "highlands",
      "boba",
      "trà sữa",
      "tra sua",
      "matcha",
      "tea",
      "trà",
      "snack",
      "dessert",
      "cake",
      "bánh ngọt",
      "ice cream",
      "kem",
      "beer",
      "bia",
      "cocktail",
      "smoothie",
      "sinh tố",
    ],
    category: "Food & Drink",
    reason: "Beverages, café visits, and snacks are enjoyable lifestyle treats (Nice to have).",
  },
  {
    keywords: [
      "movie",
      "cinema",
      "phim",
      "netflix",
      "spotify",
      "youtube",
      "concert",
      "karaoke",
      "party",
      "bowling",
      "game",
    ],
    category: "Entertainment",
    reason: "Entertainment and leisure subscriptions bring enjoyment but are non-essential (Nice to have).",
  },
  {
    keywords: ["book", "sách", "course", "udemy", "workshop"],
    category: "Education",
    reason: "Personal development and reading are positive discretionary investments (Nice to have).",
  },
  {
    keywords: ["gym", "yoga", "pilates", "massage", "spa", "skincare", "haircut", "cắt tóc"],
    category: "Health",
    reason: "Wellness and self-care improve quality of life (Nice to have).",
  },
  {
    keywords: [
      "shirt",
      "shoes",
      "clothes",
      "quần áo",
      "giày",
      "shopping",
      "shopee",
      "lazada",
      "tiktok shop",
      "gift",
      "quà",
      "decor",
      "gadget",
    ],
    category: "Shopping",
    reason: "Discretionary retail and lifestyle shopping (Nice to have).",
  },
];

const MUST_HAVE_KEYWORDS: ReadonlyArray<{ keywords: readonly string[]; category: string; reason: string }> = [
  {
    keywords: [
      "lunch",
      "dinner",
      "breakfast",
      "meal",
      "cơm",
      "com",
      "phở",
      "pho",
      "bún",
      "bun",
      "bánh mì",
      "banh mi",
      "hủ tiếu",
      "ăn sáng",
      "ăn trưa",
      "ăn tối",
      "groceries",
      "grocery",
      "siêu thị",
      "chợ",
      "thực phẩm",
      "rau",
      "thịt",
      "cá",
      "trứng",
      "sữa",
      "rice",
      "water",
    ],
    category: "Food & Drink",
    reason: "Daily meals and groceries are essential living needs (Must have).",
  },
  {
    keywords: [
      "rent",
      "tiền nhà",
      "tiền phòng",
      "mortgage",
      "electricity",
      "điện",
      "water bill",
      "tiền nước",
      "internet",
      "wifi",
      "4g",
      "5g",
      "phone bill",
      "gas bill",
      "garbage",
      "utility",
      "utilities",
      "bill",
      "hóa đơn",
    ],
    category: "Bills & Utilities",
    reason: "Housing and utility bills are mandatory recurring obligations (Must have).",
  },
  {
    keywords: [
      "fuel",
      "gasoline",
      "petrol",
      "xăng",
      "đổ xăng",
      "grab",
      "be",
      "xanh sm",
      "taxi",
      "bus",
      "metro",
      "train",
      "parking",
      "gửi xe",
      "toll",
      "oil change",
      "sửa xe",
      "commute",
    ],
    category: "Transport",
    reason: "Transportation and commuting costs are necessary for daily mobility (Must have).",
  },
  {
    keywords: [
      "medicine",
      "thuốc",
      "pharmacy",
      "hospital",
      "bệnh viện",
      "clinic",
      "khám bệnh",
      "doctor",
      "dentist",
      "nha khoa",
      "insurance",
      "bảo hiểm",
    ],
    category: "Health",
    reason: "Medical care and essential health expenses are high-priority necessities (Must have).",
  },
  {
    keywords: ["tuition", "học phí", "school"],
    category: "Education",
    reason: "Core tuition and formal education expenses (Must have).",
  },
];

export function classifyExpenseDeterministically(title: string, amountVnd: number): RuleClassification {
  const lower = title.toLowerCase();

  for (const keyword of WASTED_KEYWORDS) {
    if (lower.includes(keyword)) {
      const category =
        lower.includes("game") || lower.includes("bet") || lower.includes("casino")
          ? "Entertainment"
          : lower.includes("shopee") || lower.includes("lazada") || lower.includes("impulse")
            ? "Shopping"
            : "Other";
      return {
        tier: "WASTED",
        category,
        aiReason: `Flagged as Wasted because "${title}" matches impulse, preventable, or non-productive spending.`,
        confidence: "high",
      };
    }
  }

  // Check NICE_TO_HAVE before MUST_HAVE so "coffee" or "boba tea" is Nice to have even if paired with food words
  for (const group of NICE_TO_HAVE_KEYWORDS) {
    if (group.keywords.some((kw) => lower.includes(kw))) {
      return {
        tier: "NICE_TO_HAVE",
        category: group.category,
        aiReason: group.reason,
        confidence: "high",
      };
    }
  }

  for (const group of MUST_HAVE_KEYWORDS) {
    if (group.keywords.some((kw) => lower.includes(kw))) {
      return {
        tier: "MUST_HAVE",
        category: group.category,
        aiReason: group.reason,
        confidence: "high",
      };
    }
  }

  if (amountVnd >= 2_000_000) {
    return {
      tier: "NICE_TO_HAVE",
      category: "Other",
      aiReason: "High-value discretionary expense categorized as Nice to have pending review.",
      confidence: "low",
    };
  }

  return {
    tier: "NICE_TO_HAVE",
    category: "Other",
    aiReason: "Categorized as Nice to have based on general discretionary spending.",
    confidence: "low",
  };
}

function cleanExpenseTitle(rawSegment: string): string {
  const withoutAmount = rawSegment
    .replace(/\b\d+\s*(?:tr|triệu|trieu|m)\s*\d{1,3}\b/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:tr|triệu|trieu|m|million|k|nghìn|nghin|ngàn|ngan|cành|canh)\b/gi, " ")
    .replace(/\b\d{1,3}(?:[.,]\d{3})+\s*(?:vnd|vnđ|đ|d|đồng|dong)?\b/gi, " ")
    .replace(/\b\d+\s*(?:vnd|vnđ|đ|d|đồng|dong)?\b/gi, " ")
    .replace(/\b(?:in|bằng|bang|currency)\s+(?:vnd|vnđ|đồng|dong)\b/gi, " ")
    .replace(/\b(?:vnd|vnđ|đồng|dong)\b/gi, " ")
    .replace(/^[\s,.;:\-–—+]+|[\s,.;:\-–—+]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!withoutAmount) {
    return "Expense";
  }

  return withoutAmount.charAt(0).toUpperCase() + withoutAmount.slice(1);
}

/**
 * Splits a free-text input like "coffee 30k, lunch 50k in VND" into individual expense candidates
 * with parsed VND integers and deterministic tier/category classification.
 */
export function parseExpenseTextLocally(rawInput: string): ParsedExpenseCandidate[] {
  const normalizedInput = rawInput
    .replace(/\b(?:in|bằng|bang)\s+(?:vnd|vnđ|đồng|dong)\b/gi, "")
    .trim();

  if (!normalizedInput) {
    return [];
  }

  // First split by explicit delimiters: comma (when not inside 50,000), newline, semicolon, or " and "
  const preliminaryParts = normalizedInput
    .split(/(?:[\n;]+|,(?!\d{3}\b)|\s+\band\b\s+|\s+\bvà\b\s+)/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const candidates: ParsedExpenseCandidate[] = [];

  for (const part of preliminaryParts) {
    const amountVnd = parseAmountVnd(part);
    if (!amountVnd || amountVnd <= 0) {
      continue;
    }

    const title = cleanExpenseTitle(part);
    const classification = classifyExpenseDeterministically(title, amountVnd);

    candidates.push({
      title,
      amountVnd,
      formattedAmount: formatVnd(amountVnd),
      currency: "VND",
      tier: classification.tier,
      category: classification.category,
      aiReason: classification.aiReason,
      confidence: classification.confidence,
    });
  }

  return candidates;
}

/**
 * Determines whether all segments in `rawInput` were cleanly parsed and matched
 * high-confidence rules (or historical user classifications), making an external
 * LLM network request unnecessary.
 */
export function isHighConfidenceLocalParse(
  rawInput: string,
  items: readonly ParsedExpenseCandidate[],
): boolean {
  if (items.length === 0) return false;

  const normalizedInput = rawInput
    .replace(/\b(?:in|bằng|bang)\s+(?:vnd|vnđ|đồng|dong)\b/gi, "")
    .trim();

  const segments = normalizedInput
    .split(/(?:[\n;]+|,(?!\d{3}\b)|\s+\band\b\s+|\s+\bvà\b\s+)/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (segments.length !== items.length) {
    return false;
  }

  return items.every(
    (item) =>
      item.confidence === "high" &&
      item.title !== "Expense" &&
      item.title.length <= 50 &&
      item.amountVnd > 0,
  );
}
