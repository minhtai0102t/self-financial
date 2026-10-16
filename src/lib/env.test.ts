import { describe, expect, it } from "vitest";

import { parseAuthEnv, parseGeminiApiKeys, parseServerEnv } from "@/lib/env";

describe("parseServerEnv", () => {
  it("parses valid DATABASE_URL and comma-separated Gemini API keys", () => {
    const env = parseServerEnv({
      DATABASE_URL: "postgresql://neondb_owner:pass@ep-odd-band.neon.tech/neondb?sslmode=require",
      NEXT_PUBLIC_GEMINI_API_KEYS: " key-1 , key-2 , , key-3 ",
    });

    expect(env.DATABASE_URL).toContain("postgresql://");
    expect(env.geminiApiKeys).toEqual(["key-1", "key-2", "key-3"]);
  });

  it("prefers GEMINI_API_KEYS when both GEMINI_API_KEYS and NEXT_PUBLIC_GEMINI_API_KEYS are provided", () => {
    const keys = parseGeminiApiKeys({
      GEMINI_API_KEYS: "server-key-1,server-key-2",
      NEXT_PUBLIC_GEMINI_API_KEYS: "public-key-1",
    });

    expect(keys).toEqual(["server-key-1", "server-key-2"]);
  });

  it("throws with variable name when DATABASE_URL is missing or invalid", () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseServerEnv({ DATABASE_URL: "http://not-postgres" })).toThrow(/DATABASE_URL/);
  });
});

describe("parseAuthEnv", () => {
  it("parses configured Google OAuth credentials and ignores local-dev-placeholder", () => {
    const authEnv = parseAuthEnv({
      BETTER_AUTH_SECRET: "a-very-long-secret-key-at-least-32-chars",
      BETTER_AUTH_URL: "http://localhost:3000",
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
      GITHUB_CLIENT_ID: "local-dev-placeholder",
      GITHUB_CLIENT_SECRET: "local-dev-placeholder",
    });

    expect(authEnv.baseURL).toBe("http://localhost:3000");
    expect(authEnv.providers.google).toEqual({
      clientId: "google-id",
      clientSecret: "google-secret",
    });
    expect(authEnv.providers.github).toBeUndefined();
  });

  it("provides safe local fallback secret and baseURL when omitted in development", () => {
    const authEnv = parseAuthEnv({});
    expect(authEnv.secret.length).toBeGreaterThanOrEqual(32);
    expect(authEnv.baseURL).toBe("http://localhost:3000");
  });

  it("uses VERCEL_PROJECT_PRODUCTION_URL when deployed on Vercel with localhost BETTER_AUTH_URL", () => {
    const authEnv = parseAuthEnv({
      BETTER_AUTH_URL: "http://localhost:3000",
      VERCEL_PROJECT_PRODUCTION_URL: "self-financial.vercel.app",
      VERCEL_URL: "self-financial-git-main.vercel.app",
    });
    expect(authEnv.baseURL).toBe("https://self-financial.vercel.app");
    expect(authEnv.trustedOrigins).toContain("https://self-financial-git-main.vercel.app");
  });
});

