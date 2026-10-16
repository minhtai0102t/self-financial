import { ExpenseDashboard } from "@/features/expenses/expense-dashboard";
import {
  claimUnownedExpenses,
  getDashboardSnapshot,
} from "@/features/expenses/service";
import { requirePageActor } from "@/lib/current-actor";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const actor = await requirePageActor("/");
  await claimUnownedExpenses(actor.userId);
  const initialSnapshot = await getDashboardSnapshot({
    period: "all",
    userId: actor.userId,
  });

  return (
    <ExpenseDashboard
      initialSnapshot={initialSnapshot}
      user={{ name: actor.name, email: actor.email }}
    />
  );
}
