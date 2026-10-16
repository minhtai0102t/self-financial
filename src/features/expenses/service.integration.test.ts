import { loadEnvConfig } from "@next/env";
import { afterAll, describe, expect, it } from "vitest";

loadEnvConfig(process.cwd(), true);

import {
  deleteExpenseItem,
  getDashboardSnapshot,
  parseAndSaveExpenses,
  updateExpenseItem,
} from "@/features/expenses/service";
import { getPrisma } from "@/lib/prisma";

describe("expenses service integration (Neon PostgreSQL + Gemini AI)", () => {
  const createdBatchIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    const prisma = getPrisma();
    if (createdBatchIds.length > 0) {
      await prisma.expense.deleteMany({
        where: { batchId: { in: createdBatchIds } },
      });
      await prisma.expenseInputBatch.deleteMany({
        where: { id: { in: createdBatchIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await prisma.$disconnect();
  });

  it("parses 'coffee 30k, lunch 50k in VND', scopes expenses to authenticated user, updates tier, and computes analytics", async () => {
    const prisma = getPrisma();
    const testUserId = `test-user-${Date.now()}`;
    await prisma.user.create({
      data: {
        id: testUserId,
        name: "Test User",
        email: `${testUserId}@example.com`,
      },
    });
    createdUserIds.push(testUserId);

    const saved = await parseAndSaveExpenses({
      userId: testUserId,
      rawInput: "coffee 30k, lunch 50k in VND",
    });

    createdBatchIds.push(saved.batchId);

    expect(saved.expenses).toHaveLength(2);

    const coffee = saved.expenses.find((e) => e.title.toLowerCase().includes("coffee"));
    const lunch = saved.expenses.find((e) => e.title.toLowerCase().includes("lunch"));

    expect(coffee).toBeDefined();
    expect(coffee?.amountVnd).toBe(30_000);
    expect(coffee?.formattedAmount).toBe("30.000 VND");
    expect(coffee?.tier).toBe("NICE_TO_HAVE");

    expect(lunch).toBeDefined();
    expect(lunch?.amountVnd).toBe(50_000);
    expect(lunch?.formattedAmount).toBe("50.000 VND");
    expect(lunch?.tier).toBe("MUST_HAVE");

    // Verify user-scoped dashboard snapshot includes saved items
    const snapshot = await getDashboardSnapshot({ period: "all", userId: testUserId });
    expect(snapshot.analytics.totalVnd).toBe(80_000);

    // Another user should not see this user's expenses
    const otherSnapshot = await getDashboardSnapshot({
      period: "all",
      userId: "non-existent-user-id",
    });
    expect(otherSnapshot.analytics.totalVnd).toBe(0);

    // Update coffee tier to WASTED and verify
    if (coffee) {
      const updated = await updateExpenseItem(
        coffee.id,
        { tier: "WASTED" },
        testUserId,
      );
      expect(updated.tier).toBe("WASTED");
      expect(updated.tierLabel).toBe("Wasted");

      // Delete coffee item
      await deleteExpenseItem(coffee.id, testUserId);
    }
  });
});
