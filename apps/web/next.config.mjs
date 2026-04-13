import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
  },
};

export default withSentryConfig(nextConfig, {
  // Suppress the Sentry CLI output during build (keep CI logs clean).
  silent: !process.env.CI,

  // Upload source maps only when SENTRY_AUTH_TOKEN is set (production builds).
  // In CI/dev without the token, source maps are skipped gracefully.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Disable source map upload when no auth token (prevents build errors in dev/CI).
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
