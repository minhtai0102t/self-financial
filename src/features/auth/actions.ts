"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { configuredProviders, type ProviderId } from "@/features/auth/sign-in";
import { getAuth } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/auth-options";
import { getAuthEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/redirect";

const signInFailed = (code: string, mode?: "signin" | "signup") =>
  `${SIGN_IN_PATH}?error=${encodeURIComponent(code)}${mode === "signup" ? "&mode=signup" : ""}`;

export async function signInWithProvider(formData: FormData): Promise<never> {
  const offered = configuredProviders(getAuthEnv()).map(({ id }) => id);
  const rawProvider = formData.get("provider");
  const provider = offered.find((id): id is ProviderId => id === rawProvider);
  const next = safeRedirectPath(formData.get("next"));

  if (!provider) {
    redirect(signInFailed("provider_unavailable"));
  }

  let providerUrl: string | undefined;
  try {
    const result = await getAuth().api.signInSocial({
      body: { provider, callbackURL: next },
      headers: await headers(),
    });
    providerUrl = result.url;
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
  }

  redirect(providerUrl ?? signInFailed("sign_in_failed"));
}

export async function signInWithEmail(formData: FormData): Promise<never> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectPath(formData.get("next"));

  if (!email || !password) {
    redirect(signInFailed("invalid_credentials", "signin"));
  }

  let succeeded = false;
  try {
    await getAuth().api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
    succeeded = true;
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
  }

  redirect(succeeded ? next : signInFailed("invalid_credentials", "signin"));
}

export async function signUpWithEmail(formData: FormData): Promise<never> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectPath(formData.get("next"));

  if (!name || !email || password.length < 6) {
    redirect(signInFailed("invalid_credentials", "signup"));
  }

  let succeeded = false;
  try {
    await getAuth().api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });
    succeeded = true;
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
  }

  redirect(succeeded ? next : signInFailed("email_already_exists", "signup"));
}

export async function signOut(): Promise<never> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect(SIGN_IN_PATH);
}
