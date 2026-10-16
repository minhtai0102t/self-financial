import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/env";

const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

function normalizePgConnectionString(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (
      parsed.searchParams.get("sslmode") === "require" &&
      !parsed.searchParams.has("uselibpqcompat")
    ) {
      parsed.searchParams.set("uselibpqcompat", "true");
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function createPrisma(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: normalizePgConnectionString(getServerEnv().DATABASE_URL),
    max: 3,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

let instance: PrismaClient | undefined;

/** Lazy so that importing this module during `next build` never requires an active database connection. */
export function getPrisma(): PrismaClient {
  if (process.env.NODE_ENV === "development") {
    return (globalForPrisma.prisma ??= createPrisma());
  }
  return (instance ??= createPrisma());
}
