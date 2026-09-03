import { expect, test } from '@playwright/test';

test('homepage presents Lagos4Rent as a trust-first marketplace', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Rent in Lagos without guessing/i })).toBeVisible();
  await expect(page.getByText(/The trust layer for renting in Lagos/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /Browse homes/i }).first()).toBeVisible();
});

test('moving-out intent opens renter registration instead of redirecting away', async ({ page }) => {
  await page.goto('/join.html?intent=post');
  await expect(page.getByRole('heading', { name: /Create your Lagos4Rent account/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: /I’m a renter/i })).toHaveClass(/active/);
  await expect(page.getByRole('button', { name: /Create account/i })).toBeVisible();
});

test('agent intent selects agent registration', async ({ page }) => {
  await page.goto('/join.html?intent=agent');
  await expect(page.getByRole('heading', { name: /Create your Lagos4Rent account/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: /I’m an agent/i })).toHaveClass(/active/);
});

test('browse page exposes trust and cost filters', async ({ page }) => {
  await page.goto('/listings.html');
  await expect(page.getByRole('heading', { name: /Find a home, not a question mark/i })).toBeVisible();
  await expect(page.getByLabel('Trust level')).toBeVisible();
  await expect(page.getByLabel('Maximum total move-in')).toBeVisible();
});

test('safety guide is accessible before signup', async ({ page }) => {
  await page.goto('/safety.html');
  await expect(page.locator('body')).toContainText(/safety|verify|payment/i);
});
