import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  try {
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    const env = getServerEnv();

    return NextResponse.json({
      status: "ok",
      database: "connected",
      geminiKeysConfigured: env.geminiApiKeys.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database check failed";
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
