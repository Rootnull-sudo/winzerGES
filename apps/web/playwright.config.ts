import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra la app corriendo (npm run build && npm start, o npm run dev) con la base sembrada (npm run db:seed).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: process.env.E2E_URL ?? 'http://localhost:3000', locale: 'es-CL', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ }
  ]
});
