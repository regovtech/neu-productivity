/**
 * Vitest global setup — runs before any test file modules are evaluated.
 * Stubs env vars required by @t3-oss/env-nextjs so tests can import app
 * modules without a full .env file. Real DATABASE_URL must still be set
 * externally (CI workflow / local .env.test).
 */

// Only stub if not already set — CI/local values take precedence.
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/neu_test";
process.env.NEXTAUTH_SECRET ??= "test-secret-at-least-32-characters-long";
process.env.GOOGLE_CLIENT_ID ??= "test-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
process.env.RESEND_API_KEY ??= "test-resend-key";
process.env.CRON_SECRET ??= "test-cron-secret-16ch";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
