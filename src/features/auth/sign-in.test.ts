import { describe, expect, it } from "vitest";

import { configuredProviders, signInErrorMessage } from "@/features/auth/sign-in";
import { safeRedirectPath } from "@/lib/redirect";

describe("configuredProviders", () => {
  it("returns only providers with configured credentials", () => {
    const providers = configuredProviders({
      secret: "x".repeat(32),
      baseURL: "http://localhost:3000",
      providers: {
        google: { clientId: "gid", clientSecret: "gsecret" },
      },
    });

    expect(providers).toEqual([{ id: "google", label: "Google" }]);
  });
});

describe("safeRedirectPath", () => {
  it("allows internal paths and blocks protocol-relative or external URLs", () => {
    expect(safeRedirectPath("/")).toBe("/");
    expect(safeRedirectPath("/?period=month")).toBe("/?period=month");
    expect(safeRedirectPath("https://evil.com")).toBe("/");
    expect(safeRedirectPath("//evil.com")).toBe("/");
  });
});

describe("signInErrorMessage", () => {
  it("maps known error codes to friendly messages", () => {
    expect(signInErrorMessage("invalid_credentials")).toContain("Invalid email or password");
    expect(signInErrorMessage("email_already_exists")).toContain("already exists");
    expect(signInErrorMessage(undefined)).toBeNull();
  });
});
