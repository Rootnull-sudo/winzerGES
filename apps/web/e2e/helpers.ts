import { expect, type Browser, type Page } from '@playwright/test';

export const PASS = 'winzer1234';

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(PASS);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

export async function newSession(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, email);
  return { ctx, page };
}

export async function waitSynced(page: Page) {
  await expect(page.getByRole('button', { name: /Al día/ })).toBeVisible({ timeout: 15_000 });
}
