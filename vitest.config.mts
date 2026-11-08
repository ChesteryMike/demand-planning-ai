import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests unitarios. Las pruebas de pantalla (tests/e2e) son de Playwright y
// no corren con Vitest. Ningún test llama a un proveedor de IA real.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
    reporters: ['verbose'],
  },
});
