-- CreateEnum
CREATE TYPE "SpendingTier" AS ENUM ('MUST_HAVE', 'NICE_TO_HAVE', 'WASTED');

-- CreateTable
CREATE TABLE "ExpenseInputBatch" (
    "id" UUID NOT NULL,
    "rawInput" TEXT NOT NULL,
    "aiModel" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseInputBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "batchId" UUID,
    "title" TEXT NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "tier" "SpendingTier" NOT NULL,
    "category" TEXT NOT NULL,
    "aiReason" TEXT NOT NULL,
    "spentAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseInputBatch_createdAt_idx" ON "ExpenseInputBatch"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Expense_spentAt_idx" ON "Expense"("spentAt" DESC);

-- CreateIndex
CREATE INDEX "Expense_tier_idx" ON "Expense"("tier");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Expense_batchId_idx" ON "Expense"("batchId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ExpenseInputBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
