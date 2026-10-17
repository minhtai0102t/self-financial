import { NextResponse } from "next/server";

import {
  type DashboardPeriod,
  getDashboardSnapshot,
  parseAndSaveExpenses,
} from "@/features/expenses/service";
import { getCurrentActor } from "@/lib/current-actor";

const VALID_PERIODS = new Set<DashboardPeriod>([
  "today",
  "7d",
  "30d",
  "month",
  "quarter",
  "year",
  "all",
]);

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawPeriod = (searchParams.get("period") ?? "all") as DashboardPeriod;
    const period = VALID_PERIODS.has(rawPeriod) ? rawPeriod : "all";

    const snapshot = await getDashboardSnapshot({ period, userId: actor.userId });
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load expenses.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const saved = await parseAndSaveExpenses({
      ...(body as Parameters<typeof parseAndSaveExpenses>[0]),
      userId: actor.userId,
    });
    const snapshot = await getDashboardSnapshot({ period: "all", userId: actor.userId });

    return NextResponse.json(
      {
        ...saved,
        snapshot,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save expenses.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
