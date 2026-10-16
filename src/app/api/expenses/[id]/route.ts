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

    const { id } = await context.params;
    const patch = await request.json();
    const updated = await updateExpenseItem(id, patch, actor.userId);
    const snapshot = await getDashboardSnapshot({ period: "all", userId: actor.userId });

    return NextResponse.json({ expense: updated, snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update expense.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getCurrentActor();
    if (!actor) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id } = await context.params;
    await deleteExpenseItem(id, actor.userId);
    const snapshot = await getDashboardSnapshot({ period: "all", userId: actor.userId });

    return NextResponse.json({ deleted: true, snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete expense.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
