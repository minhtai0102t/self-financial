import { AlertTriangle, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  signInWithEmail,
  signInWithProvider,
  signUpWithEmail,
} from "@/features/auth/actions";
import { configuredProviders, signInErrorMessage } from "@/features/auth/sign-in";
import { getCurrentActor } from "@/lib/current-actor";
import { getAuthEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/redirect";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const next = safeRedirectPath(firstValue(query.next));
  const mode = firstValue(query.mode) === "signup" ? "signup" : "signin";

  if (await getCurrentActor()) {
    redirect(next);
  }

  const providers = configuredProviders(getAuthEnv());
  const errorMessage = signInErrorMessage(firstValue(query.error));

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center px-4 py-10 pt-safe pb-safe">
      <div className="mx-auto w-full max-w-sm space-y-6">
        {/* Minimal Brand Header */}
        <div className="space-y-1.5">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white">
            <Wallet className="h-4 w-4" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 pt-1">
            {mode === "signup" ? "Create account" : "Self Financial"}
          </h1>
          <p className="text-xs text-zinc-500">
            Minimalist VND spending tracker &amp; value analyzer.
          </p>
        </div>

        {/* Minimal Card */}
        <div className="rounded-xl border border-zinc-200/90 bg-white p-5 space-y-4">
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 rounded-lg bg-zinc-100 p-0.5 text-xs font-medium">
            <Link
              href={`/sign-in?next=${encodeURIComponent(next)}`}
              className={`flex min-h-8 items-center justify-center rounded-md transition ${
                mode === "signin"
                  ? "bg-white text-zinc-900 shadow-2xs"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              Sign in
            </Link>
            <Link
              href={`/sign-in?mode=signup&next=${encodeURIComponent(next)}`}
              className={`flex min-h-8 items-center justify-center rounded-md transition ${
                mode === "signup"
                  ? "bg-white text-zinc-900 shadow-2xs"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              Create account
            </Link>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2.5 text-xs text-rose-800"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {mode === "signin" ? (
            <form action={signInWithEmail} className="space-y-3">
              <input type="hidden" name="next" value={next} />
              <div>
                <label
                  htmlFor="signin-email"
                  className="block text-xs font-medium text-zinc-600 mb-1"
                >
                  Email
                </label>
                <input
                  id="signin-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="you@example.com"
                  className="w-full min-h-10 rounded-lg border border-zinc-200 bg-zinc-50/40 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-hidden"
                />
              </div>

              <div>
                <label
                  htmlFor="signin-password"
                  className="block text-xs font-medium text-zinc-600 mb-1"
                >
                  Password
                </label>
                <input
                  id="signin-password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full min-h-10 rounded-lg border border-zinc-200 bg-zinc-50/40 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-hidden"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-10 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 active:scale-99 transition"
              >
                Sign in
              </button>
            </form>
          ) : (
            <form action={signUpWithEmail} className="space-y-3">
              <input type="hidden" name="next" value={next} />
              <div>
                <label
                  htmlFor="signup-name"
                  className="block text-xs font-medium text-zinc-600 mb-1"
                >
                  Name
                </label>
                <input
                  id="signup-name"
                  name="name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Minh Tai"
                  className="w-full min-h-10 rounded-lg border border-zinc-200 bg-zinc-50/40 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-hidden"
                />
              </div>

              <div>
                <label
                  htmlFor="signup-email"
                  className="block text-xs font-medium text-zinc-600 mb-1"
                >
                  Email
                </label>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full min-h-10 rounded-lg border border-zinc-200 bg-zinc-50/40 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-hidden"
                />
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="block text-xs font-medium text-zinc-600 mb-1"
                >
                  Password
                </label>
                <input
                  id="signup-password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  className="w-full min-h-10 rounded-lg border border-zinc-200 bg-zinc-50/40 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-hidden"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-10 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 active:scale-99 transition"
              >
                Create account
              </button>
            </form>
          )}

          {providers.length > 0 && (
            <>
              <div className="relative flex items-center py-0.5">
                <div className="grow border-t border-zinc-100" />
                <span className="mx-2.5 shrink-0 text-[11px] text-zinc-400">or</span>
                <div className="grow border-t border-zinc-100" />
              </div>

              <ul className="space-y-2">
                {providers.map(({ id, label }) => (
                  <li key={id}>
                    <form action={signInWithProvider}>
                      <input type="hidden" name="provider" value={id} />
                      <input type="hidden" name="next" value={next} />
                      <button
                        type="submit"
                        className="min-h-10 w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 active:scale-99 transition"
                      >
                        Continue with {label}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
