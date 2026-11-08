import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de pantalla (6.12). No corren en CI: se ejecutan en local contra
 * `npm run dev` y en la Fase 8 contra la URL pública (BASE_URL=https://…).
 * Las pruebas marcadas @escribe modifican datos y solo corren si se piden
 * explícitamente con --grep @escribe.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  grepInvert: process.env.INCLUIR_ESCRITURA === '1' ? undefined : /@escribe/,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
