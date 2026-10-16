import { AlertTriangle, KeyRound, Mail, Sparkles, UserPlus, Wallet } from "lucide-react";
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
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-8 pt-safe pb-safe">
      <div className="mx-auto w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-sm">
            <Wallet className="h-6 w-6" />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-200">
            <Sparkles className="h-3.5 w-3.5" />
            AI Personal Spending Tracker
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {mode === "signup" ? "Create your account" : "Sign in to Self Financial"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Log daily VND expenses in plain text and track Must have, Nice to have, and Wasted spending.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-5">
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
            <Link
              href={`/sign-in?next=${encodeURIComponent(next)}`}
              className={`flex min-h-9 items-center justify-center rounded-lg transition ${
                mode === "signin"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Sign In
            </Link>
            <Link
              href={`/sign-in?mode=signup&next=${encodeURIComponent(next)}`}
              className={`flex min-h-9 items-center justify-center rounded-lg transition ${
                mode === "signup"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Create Account
            </Link>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs text-rose-900"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Email & Password Form (Works natively in iOS Home Screen PWA + Keychain) */}
          {mode === "signin" ? (
            <form action={signInWithEmail} className="space-y-3.5">
              <input type="hidden" name="next" value={next} />
              <div>
                <label
                  htmlFor="signin-email"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="signin-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="you@example.com"
                    className="w-full min-h-11 rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="signin-password"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Password
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="signin-password"
                    name="password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full min-h-11 rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full min-h-11 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 active:scale-99 transition"
              >
                Sign In
              </button>
            </form>
          ) : (
            <form action={signUpWithEmail} className="space-y-3.5">
              <input type="hidden" name="next" value={next} />
              <div>
                <label
                  htmlFor="signup-name"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Your name
                </label>
                <input
                  id="signup-name"
                  name="name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Minh Tai"
                  className="w-full min-h-11 rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-hidden"
                />
              </div>

              <div>
                <label
                  htmlFor="signup-email"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Email address
                </label>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full min-h-11 rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-hidden"
                />
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Password (min 6 characters)
                </label>
                <input
                  id="signup-password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  className="w-full min-h-11 rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-hidden"
                />
              </div>

              <button
                type="submit"
                className="inline-flex w-full min-h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 active:scale-99 transition"
              >
                <UserPlus className="h-4 w-4" />
                Create Account &amp; Continue
              </button>
            </form>
          )}

          {/* OAuth Social Providers (e.g. Google from Interview-bank) */}
          {providers.length > 0 && (
            <>
              <div className="relative flex items-center py-1">
                <div className="grow border-t border-slate-200" />
                <span className="mx-3 shrink-0 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Or continue with
                </span>
                <div className="grow border-t border-slate-200" />
              </div>

              <ul className="space-y-2.5">
                {providers.map(({ id, label }) => (
                  <li key={id}>
                    <form action={signInWithProvider}>
                      <input type="hidden" name="provider" value={id} />
                      <input type="hidden" name="next" value={next} />
                      <button
                        type="submit"
                        className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 active:scale-99 transition"
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
