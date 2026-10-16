# Self Financial

AI-powered personal spending tracker and value categorizer built with **Next.js 16**, **Prisma 7**, **PostgreSQL (Neon)**, and **Google Gemini AI**.

## Features

- **Natural-Language VND Expense Input**: Enter multi-item text such as `"coffee 30k, lunch 50k in VND"` or `"phở bò 65k, trà sữa 45k, đổ xăng 100k"` and automatically parse exact VND costs (`30.000 VND`, `50.000 VND`, `1.500.000 VND`).
- **Gemini AI Value Categorization**: Automatically classifies each expense into:
  - **Must have** (`MUST_HAVE`): Essential meals, groceries, utilities, rent, commuting, healthcare.
  - **Nice to have** (`NICE_TO_HAVE`): Lifestyle treats, coffee, snacks, books, fitness, entertainment.
  - **Wasted** (`WASTED`): Impulse purchases, unused subscriptions, preventable fees, regretful spending.
- **Multi-Key & Multi-Model Resilience**: Rotates across comma-separated Gemini API keys (`NEXT_PUBLIC_GEMINI_API_KEYS` / `GEMINI_API_KEYS`) and falls back to a deterministic local parser if offline.
- **Reporting & Analytics Dashboard**:
  - Total spend, daily average, and per-tier VND totals + percentages (`Must have`, `Nice to have`, `Wasted`)
  - Stacked value ratio bar and automated financial health insights
  - Domain category breakdown (`Food & Drink`, `Transport`, `Bills & Utilities`, `Shopping`, `Entertainment`, `Health`, `Education`)
  - Daily spending trend chart
  - Filterable, searchable expense ledger with one-click tier reclassification, inline editing, deletion, and CSV export

## Setup

```bash
pnpm install
cp .env.example .env
# Configure DATABASE_URL and NEXT_PUBLIC_GEMINI_API_KEYS in .env
pnpm db:migrate
pnpm dev
```

## Scripts

- `pnpm dev` — Start development server
- `pnpm build` — Build production bundle
- `pnpm typecheck` — Run Next.js typegen and TypeScript check
- `pnpm lint` — Run ESLint
- `pnpm test` — Run unit tests (Vitest)
- `pnpm test:integration` — Run PostgreSQL + Gemini integration tests
