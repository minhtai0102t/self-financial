import type { BetterAuthOptions } from "better-auth";

import type { AuthEnv } from "./env";

export const SIGN_IN_PATH = "/sign-in";

export function buildAuthOptions(env: AuthEnv) {
  const { google, github } = env.providers;

  return {
    appName: "Self Financial",
    baseURL: env.baseURL,
    secret: env.secret,
    trustedOrigins: [...env.trustedOrigins],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
    },
    socialProviders: {
      ...(google && { google: { clientId: google.clientId, clientSecret: google.clientSecret } }),
      ...(github && { github: { clientId: github.clientId, clientSecret: github.clientSecret } }),
    },
    account: {
      storeStateStrategy: "cookie",
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
      },
    },
    user: {
      additionalFields: {
        role: { type: ["USER", "ADMIN"], required: true, defaultValue: "USER", input: false },
      },
    },
    onAPIError: { errorURL: SIGN_IN_PATH },
  } satisfies BetterAuthOptions;
}
