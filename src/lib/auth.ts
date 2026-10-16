import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { buildAuthOptions } from "@/lib/auth-options";
import { getAuthEnv } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

function createAuth() {
  return betterAuth({
    ...buildAuthOptions(getAuthEnv()),
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

export function getAuth(): ReturnType<typeof createAuth> {
  return (instance ??= createAuth());
}
