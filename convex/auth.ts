import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeName(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : undefined;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = normalizeEmail(params.email);
        if (!email) {
          throw new Error("Email is required");
        }

        const name = normalizeName(params.name);
        const profile: { email: string; name?: string } = { email };
        if (name) {
          profile.name = name;
        }
        return profile;
      },
    }),
  ],
});
