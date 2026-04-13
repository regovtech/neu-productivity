"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth/config";
import { appRouter } from "@/lib/trpc/routers/root";
import { sql } from "@/lib/db/client";
import { TRPCError } from "@trpc/server";
import { sendEmail, renderWelcomeEmail } from "@/lib/email/resend";
import { env } from "@/lib/env";

// Minimal server-side tRPC context (no session needed for public procedures)
const serverCtx = { session: null, db: sql, withUserContext: null };

export async function registerAction(formData: FormData) {
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const displayName = (formData.get("displayName") as string | null)?.trim() || undefined;

  const caller = appRouter.createCaller(serverCtx);
  try {
    await caller.users.register({ email, password, displayName });
    // Send welcome email (non-blocking — failure must not prevent registration)
    const tmpl = renderWelcomeEmail({
      displayName: displayName ?? email.split("@")[0]!,
      appUrl: env.NEXT_PUBLIC_APP_URL,
    });
    sendEmail({ to: email, ...tmpl }).catch(() => {/* swallow — email is best-effort */});
  } catch (err) {
    if (err instanceof TRPCError) {
      return { error: err.message };
    }
    return { error: "Registration failed. Please try again." };
  }

  // Auto sign-in immediately after registration — go to onboarding wizard
  await signIn("credentials", { email, password, redirectTo: "/onboarding" });
}

export async function loginAction(formData: FormData) {
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw err; // re-throw NEXT_REDIRECT so Next.js handles navigation
  }
}

export async function loginWithGoogleAction() {
  await signIn("google", { redirectTo: "/dashboard" });
}
