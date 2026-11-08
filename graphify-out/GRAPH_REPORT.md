# Graph Report - self-financial  (2026-11-08)

## Corpus Check
- Corpus is ~19,344 words - fits in a single context window. You may not need a graph.

## Summary
- 384 nodes · 844 edges · 21 communities (16 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.85)
- Token cost: AST extraction used no LLM tokens; semantic extraction token usage is unavailable because the agent tool did not expose usage. Tracker zeros are placeholders, not measured cost.

## Extraction Limitations and Graph Health
- Both semantic documents were read completely (README.md: 37/37 lines; public\robots.txt: 3/3 lines). All 50 code files have attributed graph nodes; 12 code files yielded no additional symbols beyond file/import or data nodes.
- The optional SQL parser was installed in the existing graphify tool environment; both migrations contributed 23 SQL nodes. Application dependencies were unchanged.
- Integrity warning: 3 dangling-endpoint edges reference the stylesheet and excluded generated Prisma client; 1 external node:url reference is also unresolved. These are references, not verified definitions.
- One self-call edge was detected. The default undirected graph collapses 20 parallel-edge pairs, losing some per-relation or source-location detail. Raw diagnostic counts are retained in graph_health.json.
- graphify-out\ was written into the working tree and is not currently ignored. Add it to .gitignore, or commit only the outputs your team should share: https://docs.graphify.com/guides/team-workflows.

## Community Hubs (Navigation)
- Dashboard and Optimistic Cache
- Authentication and Session Handling
- Expense API and Persistence
- Spending Analytics and Reports
- Gemini and Local Parsing
- Product Features and Setup
- Database Tables and Migrations
- TypeScript Compiler Configuration
- Development Tool Dependencies
- Runtime Library Dependencies
- Build and Database Scripts
- Package Runtime Requirements
- Application Layout and Fonts
- ESLint Configuration
- Prisma Environment Configuration
- Vercel Deployment Configuration
- Crawler Access Policy
- Apple Icon Generation
- Application Icon Generation
- PostCSS Configuration

## God Nodes (most connected - your core abstractions)
1. `ExpenseDashboard()` - 34 edges
2. `formatVnd()` - 22 edges
3. `compilerOptions` - 20 edges
4. `buildExpenseAnalytics()` - 15 edges
5. `SpendingTierValue` - 15 edges
6. `getDashboardSnapshot()` - 15 edges
7. `next` - 14 edges
8. `getPrisma()` - 14 edges
9. `getTierLabel()` - 13 edges
10. `getCurrentActor` - 13 edges

## Surprising Connections (you probably didn't know these)
- `ExpenseInputBatch_userId_createdAt_idx` --indexes--> `"ExpenseInputBatch"`  [EXTRACTED]
  prisma/migrations/20261016105322_add_auth/migration.sql → prisma/migrations/20261016085714_init/migration.sql
- `Expense_userId_spentAt_idx` --indexes--> `"Expense"`  [EXTRACTED]
  prisma/migrations/20261016105322_add_auth/migration.sql → prisma/migrations/20261016085714_init/migration.sql
- `GET()` --calls--> `getAuth()`  [EXTRACTED]
  src/app/api/auth/[...all]/route.ts → src/lib/auth.ts
- `POST()` --calls--> `getAuth()`  [EXTRACTED]
  src/app/api/auth/[...all]/route.ts → src/lib/auth.ts
- `HomePage()` --calls--> `ExpenseDashboard()`  [EXTRACTED]
  src/app/page.tsx → src/features/expenses/expense-dashboard.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Expenses are classified into three value tiers** — readme_gemini_ai_value_categorization, readme_must_have, readme_nice_to_have, readme_wasted [EXTRACTED 1.00]

## Communities (21 total, 5 thin omitted)

### Community 0 - "Dashboard and Optimistic Cache"
Cohesion: 0.10
Nodes (48): applyOptimisticExpenseCreate(), applyOptimisticExpenseDelete(), applyOptimisticExpensePatch(), buildOptimisticExpensesFromInput(), CachedSnapshotEntry, clearCachedSnapshots(), DEFAULT_SNAPSHOT_TTL_MS, deriveSnapshotForPeriod() (+40 more)

### Community 1 - "Authentication and Session Handling"
Cohesion: 0.10
Nodes (37): better-auth, server-only, GET(), POST(), firstValue(), metadata, SignInPage(), signInFailed() (+29 more)

### Community 2 - "Expense API and Persistence"
Cohesion: 0.11
Nodes (32): nextConfig, next, DELETE(), PATCH(), POST(), GET(), POST(), VALID_PERIODS (+24 more)

### Community 3 - "Spending Analytics and Reports"
Cohesion: 0.10
Nodes (31): addItemToPeriodAccumulator(), AnalyticsExpenseItem, buildExpenseAnalytics(), CategoryBreakdownItem, DailySpendPoint, ExpenseAnalyticsSnapshot, filterExpensesByPeriod(), finalizePeriodSeries() (+23 more)

### Community 4 - "Gemini and Local Parsing"
Cohesion: 0.10
Nodes (24): vitest@^5.0.3, vitest, CachedPreviewEntry, buildSystemInstruction(), DEFAULT_GEMINI_MODELS, DEFAULT_GEMINI_TIMEOUT_MS, DEFAULT_MAX_GEMINI_ATTEMPTS, extractJsonFromGeminiText() (+16 more)

### Community 5 - "Product Features and Setup"
Cohesion: 0.11
Nodes (15): Domain category breakdown: Food & Drink, Transport, Bills & Utilities, Shopping, Entertainment, Health, Education, ESLint, Google Gemini AI, Must have (MUST_HAVE): essential spending, Neon, Next.js 16, Nice to have (NICE_TO_HAVE): lifestyle spending, pnpm setup and development scripts (+7 more)

### Community 6 - "Database Tables and Migrations"
Cohesion: 0.16
Nodes (21): "Expense", Expense_batchId_idx, Expense_category_idx, Expense_spentAt_idx, Expense_tier_idx, "ExpenseInputBatch", ExpenseInputBatch_createdAt_idx, "account" (+13 more)

### Community 7 - "TypeScript Compiler Configuration"
Cohesion: 0.09
Nodes (22): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+14 more)

### Community 8 - "Development Tool Dependencies"
Cohesion: 0.12
Nodes (17): devDependencies, @playwright/test@^1.63.0, tailwindcss@^4.3.3, @tailwindcss/postcss@^4.3.3, @types/node@^24.19.1, @types/pg@^8.23.1, @types/react@^19.3.0, @types/react-dom@^19.3.0 (+9 more)

### Community 9 - "Runtime Library Dependencies"
Cohesion: 0.12
Nodes (16): dependencies, better-auth@^1.7.7, lucide-react@^1.57.0, next@16.3.8, pg@^8.23.1, @prisma/adapter-pg@^7.10.0, @prisma/client@^7.10.0, react-dom@19.3.0 (+8 more)

### Community 10 - "Build and Database Scripts"
Cohesion: 0.17
Nodes (12): scripts, build, db:deploy, db:migrate, db:push, dev, lint, postinstall (+4 more)

### Community 11 - "Package Runtime Requirements"
Cohesion: 0.18
Nodes (10): tsx@^4.23.15, engines, node, name, packageManager, pnpm, onlyBuiltDependencies, private (+2 more)

### Community 12 - "Application Layout and Fonts"
Cohesion: 0.22
Nodes (6): react@19.3.0, react, metadata, mono, sans, viewport

### Community 13 - "ESLint Configuration"
Cohesion: 0.40
Nodes (4): eslint@^9.39.5, eslint-config-next@16.3.8, eslint, eslint-config-next

### Community 14 - "Prisma Environment Configuration"
Cohesion: 0.40
Nodes (4): @next/env@^16.3.8, prisma@^7.10.0, @next/env, prisma

### Community 15 - "Vercel Deployment Configuration"
Cohesion: 0.40
Nodes (4): buildCommand, framework, installCommand, $schema

## Knowledge Gaps
- **7 isolated node(s):** `Prisma 7`, `Neon`, `Domain category breakdown: Food & Drink, Transport, Bills & Utilities, Shopping, Entertainment, Health, Education`, `TypeScript checking`, `ESLint` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 117 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Expense API and Persistence` to `Authentication and Session Handling`, `Runtime Library Dependencies`, `Package Runtime Requirements`, `Application Layout and Fonts`, `Apple Icon Generation`, `Application Icon Generation`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `ExpenseDashboard()` (e.g. with `getStandaloneModeServerSnapshot()` and `getStandaloneModeSnapshot()`) actually correct?**
  _`ExpenseDashboard()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Prisma 7`, `Neon`, `Domain category breakdown: Food & Drink, Transport, Bills & Utilities, Shopping, Entertainment, Health, Education` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard and Optimistic Cache` be split into smaller, more focused modules?**
  _Cohesion score 0.09649122807017543 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `Gemini and Local Parsing` to `Dashboard and Optimistic Cache`, `Authentication and Session Handling`, `Expense API and Persistence`, `Spending Analytics and Reports`, `Package Runtime Requirements`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Should `Authentication and Session Handling` be split into smaller, more focused modules?**
  _Cohesion score 0.10040816326530612 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Application Layout and Fonts` to `Dashboard and Optimistic Cache`, `Spending Analytics and Reports`, `Package Runtime Requirements`, `Authentication and Session Handling`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._