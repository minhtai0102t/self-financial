import { NextResponse } from "next/server";

import {
  deleteExpenseItem,
  getDashboardSnapshot,
  updateExpenseItem,
} from "@/features/expenses/service";
import { getCurrentActor } from "@/lib/current-actor";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getCurrentActor();
    if (!actor) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const { id } = await context.params;
    const patch = (await request.json()) as Record<string, unknown>;
    const skipSnapshot =
      patch.includeSnapshot === false || searchParams.get("includeSnapshot") === "0";

    const updated = await updateExpenseItem(id, patch, actor.userId);
    if (skipSnapshot) {
      return NextResponse.json({ expense: updated });
    }

    const snapshot = await getDashboardSnapshot({ period: "all", userId: actor.userId });

    return NextResponse.json({ expense: updated, snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update expense.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getCurrentActor();
    if (!actor) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const skipSnapshot = searchParams.get("includeSnapshot") === "0";
    const { id } = await context.params;
    await deleteExpenseItem(id, actor.userId);

    if (skipSnapshot) {
      return NextResponse.json({ deleted: true });
    }

    const snapshot = await getDashboardSnapshot({ period: "all", userId: actor.userId });

    return NextResponse.json({ deleted: true, snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete expense.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
