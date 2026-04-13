import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring: sample 10% of transactions in production.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Only enable in production — avoid noise in dev / test.
  enabled: process.env.NODE_ENV === "production",

  // Strip PII: capture userId (opaque UUID) only, never email/name.
  beforeSend(event) {
    if (event.user) {
      // Keep id for deduplication, strip everything else.
      event.user = { id: event.user.id };
    }
    return event;
  },
});
