import type { AuthEnv } from "@/lib/env";

export const PROVIDERS = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];

export interface Provider {
  readonly id: ProviderId;
  readonly label: string;
}

export function configuredProviders(env: AuthEnv): Provider[] {
  return PROVIDERS.filter(({ id }) => env.providers[id]);
}

const SESSION_EXPIRED =
  "That sign-in attempt expired or was started in another browser. Please try again.";

const MESSAGES = new Map([
  ["access_denied", "Sign-in was cancelled. You can try again when you are ready."],
  [
    "account_not_linked",
    "This email address already belongs to an account that signs in with a different provider.",
  ],
  ["state_mismatch", SESSION_EXPIRED],
  ["state_invalid", SESSION_EXPIRED],
  ["state_not_found", SESSION_EXPIRED],
  [
    "email_not_found",
    "The provider did not share an email address. Please sign in with email and password or another provider.",
  ],
  ["provider_unavailable", "That sign-in option is not available."],
  ["invalid_credentials", "Invalid email or password. Please check your credentials and try again."],
  ["email_already_exists", "An account with this email already exists. Please sign in instead."],
]);

const GENERAL_MESSAGE = "Sign-in did not finish. Please try again.";

export function signInErrorMessage(code: unknown): string | null {
  if (typeof code !== "string" || code === "") return null;
  return MESSAGES.get(code) ?? GENERAL_MESSAGE;
}
