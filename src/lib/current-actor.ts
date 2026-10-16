import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { Actor } from "@/lib/actor";
import { SIGN_IN_PATH } from "@/lib/auth-options";
import { safeRedirectPath } from "@/lib/redirect";
import { actorFromHeaders } from "@/lib/session";

export const getCurrentActor = cache(async (): Promise<Actor | null> =>
  actorFromHeaders(await headers()),
);

export async function requirePageActor(returnTo: string): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) {
    redirect(`${SIGN_IN_PATH}?next=${encodeURIComponent(safeRedirectPath(returnTo))}`);
  }
  return actor;
}
