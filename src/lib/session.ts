import "server-only";

import type { Actor } from "@/lib/actor";
import { getAuth } from "@/lib/auth";

export async function actorFromHeaders(headers: Headers): Promise<Actor | null> {
  const session = await getAuth().api.getSession({ headers });
  if (!session) return null;

  const { id, name, email, role } = session.user;
  return {
    userId: id,
    name: name || email,
    email,
    role: role === "ADMIN" ? "ADMIN" : "USER",
  };
}
