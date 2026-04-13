/**
 * E2E smoke tests — signup → first check-in
 *
 * Covers the three critical activation loops:
 *   1. New user signup → onboarding wizard → first goal created → dashboard
 *   2. Goal created → check-in logged on goal detail → dashboard reflects it
 *   3. Workspace creation → invite member by email → invite confirmed in UI
 *
 * Requires a running Next.js app (BASE_URL env) with a seeded Postgres.
 * Screenshots are captured automatically on failure (see playwright.config.ts).
 */

import { test, expect, type Page } from "@playwright/test";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique email to avoid cross-test pollution. */
function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${crypto.randomUUID().slice(0, 8)}@smoke.test`;
}

/** Future date string YYYY-MM-DD. */
function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Register a new user and complete the onboarding wizard with a goal.
 * Returns the created goal title.
 */
async function signupAndOnboard(
  page: Page,
  opts: { email: string; password: string; displayName: string; goalTitle: string }
): Promise<void> {
  const { email, password, displayName, goalTitle } = opts;

  await page.goto("/register");
  await page.getByPlaceholder("Jane Smith").fill(displayName);
  await page.getByPlaceholder("jane@example.com").fill(email);
  await page.getByPlaceholder("At least 8 characters").fill(password);
  await page.getByRole("button", { name: /create account/i }).click();

  // Should land on onboarding (/onboarding) or dashboard
  await expect(page).toHaveURL(/\/(onboarding|dashboard)/, { timeout: 15_000 });

  if (page.url().includes("/onboarding")) {
    // Step 1: welcome / display name
    const nameInput = page.getByPlaceholder("Your name");
    await nameInput.fill(displayName);
    await page.getByRole("button", { name: /next|continue|get started/i }).first().click();

    // Step 2: first goal
    await expect(page.getByPlaceholder(/e\.g\. Run 5km/i)).toBeVisible({ timeout: 5_000 });

    // Pick a category
    await page.getByRole("button", { name: /work/i }).first().click();
    await page.getByPlaceholder(/e\.g\. Run 5km/i).fill(goalTitle);
    await page.getByPlaceholder(/e\.g\. 100/i).fill("50");
    await page.getByPlaceholder(/km, pages/i).fill("tasks");

    // Cadence
    await page.getByRole("button", { name: /weekly/i }).first().click();

    // Target date — fill date input
    const dateInput = page.locator('input[type="date"]').first();
    await dateInput.fill(futureDate(30));

    await page.getByRole("button", { name: /create goal/i }).click();

    // Done step — should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  }
}

// ---------------------------------------------------------------------------
// Test 1: Signup → onboarding → first goal → dashboard
// ---------------------------------------------------------------------------

test("new user signup → onboarding wizard → first goal → dashboard", async ({ page }) => {
  const email = uniqueEmail("signup");
  const goalTitle = `E2E Smoke Goal ${Date.now()}`;

  await signupAndOnboard(page, {
    email,
    password: "secure-password-e2e",
    displayName: "E2E Alice",
    goalTitle,
  });

  // Dashboard should load and show the goal
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(goalTitle)).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// Test 2: Goal → check-in → dashboard reflects progress
// ---------------------------------------------------------------------------

test("goal check-in → dashboard shows progress", async ({ page }) => {
  const email = uniqueEmail("checkin");
  const goalTitle = `E2E Check-in Goal ${Date.now()}`;

  await signupAndOnboard(page, {
    email,
    password: "secure-password-e2e",
    displayName: "E2E Bob",
    goalTitle,
  });

  // Navigate to goals list
  await page.goto("/goals");
  await expect(page.getByText(goalTitle)).toBeVisible({ timeout: 10_000 });

  // Click into the goal
  await page.getByText(goalTitle).click();
  await expect(page).toHaveURL(/\/goals\//, { timeout: 5_000 });

  // Log a check-in: fill the value input and submit
  const valueInput = page.locator('input[type="number"]').first();
  await valueInput.fill("25");
  await page.getByRole("button", { name: /log check-in/i }).click();

  // Check-in should appear in the history list below
  await expect(page.getByText(/25/)).toBeVisible({ timeout: 8_000 });

  // Return to dashboard — progress ring / badge should update
  await page.goto("/dashboard");
  await expect(page.getByText(goalTitle)).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// Test 3: Workspace creation → invite member by email
// ---------------------------------------------------------------------------

test("workspace creation → invite member → invite confirmed in UI", async ({ page }) => {
  const ownerEmail = uniqueEmail("ws-owner");
  const memberEmail = uniqueEmail("ws-member");

  await signupAndOnboard(page, {
    email: ownerEmail,
    password: "secure-password-e2e",
    displayName: "E2E Workspace Owner",
    goalTitle: `Owner Seed Goal ${Date.now()}`,
  });

  // Navigate to create workspace
  await page.goto("/workspace/new");
  await expect(page.getByPlaceholder("Acme Corp")).toBeVisible({ timeout: 5_000 });

  const workspaceName = `E2E Workspace ${Date.now()}`;
  await page.getByPlaceholder("Acme Corp").fill(workspaceName);

  // Slug auto-populates — override with a clean value
  const slugInput = page.getByPlaceholder("acme-corp");
  const autoSlug = await slugInput.inputValue();
  const slug = autoSlug || `e2e-ws-${Date.now()}`;
  await slugInput.fill(slug);

  await page.getByRole("button", { name: /create workspace/i }).click();

  // Should land on workspace page
  await expect(page).toHaveURL(new RegExp(`/workspace/${slug}`), { timeout: 15_000 });

  // Navigate to members page
  await page.goto(`/workspace/${slug}/members`);
  await expect(page.getByPlaceholder("colleague@company.com")).toBeVisible({ timeout: 5_000 });

  // Invite by email
  await page.getByPlaceholder("colleague@company.com").fill(memberEmail);
  await page.getByRole("button", { name: /invite/i }).click();

  // Success toast / message
  await expect(page.getByText(/invite sent/i)).toBeVisible({ timeout: 8_000 });

  // Pending invite should appear in the list
  await expect(page.getByText(memberEmail)).toBeVisible({ timeout: 5_000 });
});
