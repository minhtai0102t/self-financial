import "server-only";

import { z } from "zod";

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

const serverEnvSchema = z.object({
  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl.optional(),
});

export interface ServerEnv {
  readonly DATABASE_URL: string;
  readonly DIRECT_URL?: string;
  readonly geminiApiKeys: readonly string[];
}

function failWithNames(error: z.ZodError): never {
  const names = new Set(error.issues.map((issue) => issue.path.join(".")));
  throw new Error(`Invalid or missing environment variables: ${[...names].join(", ")}`);
}

export function parseGeminiApiKeys(source: Record<string, string | undefined>): string[] {
  const raw = source.GEMINI_API_KEYS ?? source.NEXT_PUBLIC_GEMINI_API_KEYS ?? "";
  return raw
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    return failWithNames(result.error);
  }

  return {
    DATABASE_URL: result.data.DATABASE_URL,
    DIRECT_URL: result.data.DIRECT_URL,
    geminiApiKeys: parseGeminiApiKeys(source),
  };
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

export interface ProviderCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface AuthEnv {
  readonly secret: string;
  readonly baseURL: string;
  readonly trustedOrigins: readonly string[];
  readonly providers: {
    readonly google?: ProviderCredentials;
    readonly github?: ProviderCredentials;
  };
}

function cleanCredential(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === "local-dev-placeholder") {
    return undefined;
  }
  return trimmed;
}

export function parseAuthEnv(source: Record<string, string | undefined>): AuthEnv {
  const rawSecret = source.BETTER_AUTH_SECRET?.trim();
  const secret =
    rawSecret && rawSecret.length >= 32
      ? rawSecret
      : "self-financial-fallback-secret-key-at-least-32-chars";

  const vercelProdHost = source.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const vercelPreviewHost = source.VERCEL_URL?.trim();
  const vercelOrigin = vercelProdHost
    ? `https://${vercelProdHost}`
    : vercelPreviewHost
      ? `https://${vercelPreviewHost}`
      : undefined;

  const rawBaseUrl = source.BETTER_AUTH_URL?.trim();
  let baseURL = vercelOrigin ?? "http://localhost:3000";
  if (rawBaseUrl && URL.canParse(rawBaseUrl)) {
    const parsedOrigin = new URL(rawBaseUrl).origin;
    // On Vercel, if BETTER_AUTH_URL was accidentally copied as http://localhost:3000, prefer the live Vercel HTTPS origin
    if (vercelOrigin && parsedOrigin.startsWith("http://localhost")) {
      baseURL = vercelOrigin;
    } else {
      baseURL = parsedOrigin;
    }
  }

  const trustedSet = new Set<string>([baseURL]);
  if (vercelProdHost) trustedSet.add(`https://${vercelProdHost}`);
  if (vercelPreviewHost) trustedSet.add(`https://${vercelPreviewHost}`);
  trustedSet.add("https://*.vercel.app");

  const googleId = cleanCredential(source.GOOGLE_CLIENT_ID);
  const googleSecret = cleanCredential(source.GOOGLE_CLIENT_SECRET);
  const githubId = cleanCredential(source.GITHUB_CLIENT_ID);
  const githubSecret = cleanCredential(source.GITHUB_CLIENT_SECRET);

  const google =
    googleId && googleSecret ? { clientId: googleId, clientSecret: googleSecret } : undefined;
  const github =
    githubId && githubSecret ? { clientId: githubId, clientSecret: githubSecret } : undefined;

  return {
    secret,
    baseURL,
    trustedOrigins: [...trustedSet],
    providers: {
      ...(google && { google }),
      ...(github && { github }),
    },
  };
}

let cachedAuth: AuthEnv | undefined;

export function getAuthEnv(): AuthEnv {
  cachedAuth ??= parseAuthEnv(process.env);
  return cachedAuth;
}

