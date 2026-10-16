import { NextResponse } from "next/server";

import { previewExpenseParse } from "@/features/expenses/service";
import { getCurrentActor } from "@/lib/current-actor";

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = (await request.json()) as { rawInput?: string };
    const rawInput = typeof body?.rawInput === "string" ? body.rawInput.trim() : "";

    if (!rawInput) {
      return NextResponse.json(
        { error: 'Please enter spending text, e.g. "coffee 30k, lunch 50k in VND".' },
        { status: 400 },
      );
    }

    const result = await previewExpenseParse(rawInput, { userId: actor.userId });
    if (result.items.length === 0) {
      return NextResponse.json(
        {
          error:
            'Could not detect any expense amounts. Try a format like "coffee 30k, lunch 50k in VND".',
        },
        { status: 422 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse expenses.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
