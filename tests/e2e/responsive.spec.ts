/**
 * Verificación responsive (6.12), a 375 × 812 y 1280 × 800:
 *   · sin desplazamiento horizontal de la página;
 *   · a 375 px el botón "Menú" se ve y la barra de enlaces no; a 1280 px, al revés;
 *   · a 375 px, en /plan no hay <table> visible y hay tarjetas con el nivel (@fase6).
 * Capturas en docs/evidencias/responsive/ solo con CAPTURAS=1 (Fase 8, URL pública).
 */
import { expect, test, type Page } from '@playwright/test';

const ANCHOS = [
  { nombre: '375', width: 375, height: 812, celular: true },
  { nombre: '1280', width: 1280, height: 800, celular: false },
] as const;

const CAPTURAS = process.env.CAPTURAS === '1';

async function primerProducto(page: Page): Promise<string> {
  await page.goto('/productos');
  const href = await page.locator('a[href^="/productos/"]').first().getAttribute('href');
  if (!href) throw new Error('No hay productos: restaure la demo antes de probar.');
  return href;
}

async function revisar(page: Page, ruta: string, celular: boolean, nombreCaptura: string) {
  const respuesta = await page.goto(ruta);
  expect(respuesta?.status(), `estado HTTP de ${ruta}`).toBe(200);
  await page.waitForLoadState('networkidle');

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `desplazamiento horizontal en ${ruta}`).toBeLessThanOrEqual(innerWidth);

  const menu = page.getByTestId('boton-menu');
  const barra = page.getByTestId('barra-enlaces');
  if (celular) {
    await expect(menu).toBeVisible();
    await expect(barra).toBeHidden();
  } else {
    await expect(menu).toBeHidden();
    await expect(barra).toBeVisible();
  }

  if (CAPTURAS) await page.screenshot({ path: `docs/evidencias/responsive/${nombreCaptura}.png`, fullPage: true });
}

for (const ancho of ANCHOS) {
  test.describe(`a ${ancho.nombre} px`, () => {
    test.use({ viewport: { width: ancho.width, height: ancho.height } });

    for (const ruta of ['/', '/ventas', '/productos', '/compras']) {
      test(`${ruta} sin desplazamiento horizontal y con la navegación correcta`, async ({ page }) => {
        await revisar(page, ruta, ancho.celular, `${ruta === '/' ? 'panel' : ruta.slice(1)}-${ancho.nombre}`);
      });
    }

    for (const ruta of ['/ventas', '/compras']) {
      test(`${ruta} › pestaña Visualización (tabla o tarjetas) sin desplazamiento horizontal`, async ({ page }) => {
        await page.goto(ruta);
        await page.getByRole('tab', { name: 'Visualización' }).click();
        await page.waitForLoadState('networkidle');
        const exceso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(exceso, `desplazamiento horizontal en ${ruta} › Visualización`).toBeLessThanOrEqual(0);
        if (CAPTURAS) await page.screenshot({ path: `docs/evidencias/responsive/${ruta.slice(1)}-visualizacion-${ancho.nombre}.png`, fullPage: true });
      });
    }

    test('/productos/{id del primer producto}', async ({ page }) => {
      const ruta = await primerProducto(page);
      await revisar(page, ruta, ancho.celular, `ficha-producto-${ancho.nombre}`);
    });

    for (const ruta of ['/pronostico', '/plan']) {
      test(`${ruta} sin desplazamiento horizontal @fase6`, async ({ page }) => {
        await revisar(page, ruta, ancho.celular, `${ruta.slice(1)}-${ancho.nombre}`);
      });
    }

    if (ancho.celular) {
      test('/plan a 375 px: sin <table> visible y con tarjetas que muestran el nivel @fase6', async ({ page }) => {
        await page.goto('/plan');
        await expect(page.locator('table:visible')).toHaveCount(0);
        const tarjetas = page.getByTestId('tarjeta').filter({ hasText: /Quiebre|Merma|Sobrestock|Normal|Sin ventas/ });
        expect(await tarjetas.count()).toBeGreaterThan(0);
      });
    }
  });
}
