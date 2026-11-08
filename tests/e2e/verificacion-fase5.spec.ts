/**
 * Verificación de la Fase 5 (sección 10), puntos (a)–(d). ESCRIBE DATOS:
 * solo corre con INCLUIR_ESCRITURA=1 y --grep @escribe. Usa el prefijo PRUEBA-F5.
 * Los puntos (e) y (f) se verifican aparte (consulta SQL y responsive.spec.ts).
 */
import { expect, test } from '@playwright/test';

const NIVELES = ['quiebre', 'merma', 'sobrestock', 'normal', 'sin_ventas'];
const CSV = [
  'Fecha;Producto;Cantidad',
  '01-11-2026;Marraqueta;40',
  '02-11-2026;Marraqueta;38',
  '02-11-2026;PRUEBA-F5 Queque;6',
].join('\n');

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1280, height: 800 } });

test('(a) tras restaurar la demo, el Panel muestra al menos una alerta de cada nivel @escribe', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Restaurar datos de ejemplo' }).click();
  await page.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await expect(page.getByText('Se restauraron los datos de ejemplo.')).toBeVisible();
  await page.reload();
  for (const nivel of NIVELES) {
    const cantidad = await page.getByTestId('alerta').locator(`[data-nivel="${nivel}"]`).count();
    console.log(`  alertas ${nivel}: ${cantidad}`);
    expect(cantidad, `alertas de nivel ${nivel}`).toBeGreaterThanOrEqual(1);
  }
});

test('(b) Productos lista 10 @escribe', async ({ page }) => {
  await page.goto('/productos');
  await expect(page.getByText('10 productos')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Lista de productos' }).locator('tbody tr')).toHaveCount(10);
});

test('(c) importar PRUEBA-F5.csv (3 filas, 1 producto nuevo): enlace a su ficha que abre /productos/{id} @escribe', async ({ page }) => {
  await page.goto('/ventas');
  await page.locator('input[type="file"]').setInputFiles({ name: 'PRUEBA-F5.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await expect(page.getByText('Vista previa: PRUEBA-F5.csv')).toBeVisible();
  await expect(page.getByText('PRUEBA-F5 Queque (1 fila) · Se crearán')).toBeVisible();
  await expect(page.getByLabel('No crearlos (sus filas no se guardarán)')).toBeVisible();

  await page.getByRole('button', { name: 'Guardar 3 filas' }).click();
  await expect(page.getByText('Se guardaron 3 filas. Se creó 1 producto nuevo: completen sus datos.')).toBeVisible();

  const enlace = page.getByRole('link', { name: 'Completar datos de «PRUEBA-F5 Queque»' });
  const href = await enlace.getAttribute('href');
  console.log(`  enlace a la ficha: ${href}`);
  expect(href).toMatch(/^\/productos\/[0-9a-f-]{36}$/);
  await enlace.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole('heading', { name: 'PRUEBA-F5 Queque' })).toBeVisible();
  await expect(page.getByText('Faltan datos').first()).toBeVisible();
});

test('(d) eliminar la importación completa, con la confirmación de 3 filas @escribe', async ({ page }) => {
  await page.goto('/ventas');
  await page.getByRole('tab', { name: 'Visualización' }).click();
  const fila = page.getByRole('table', { name: 'Importaciones' }).getByRole('row').filter({ hasText: 'PRUEBA-F5.csv' });
  await expect(fila).toHaveCount(1);
  await fila.getByRole('button', { name: 'Eliminar importación' }).click();
  await expect(page.getByText('Se borrarán 3 filas. Los productos creados por esta importación no se eliminan.')).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Importaciones' }).getByRole('row').filter({ hasText: 'PRUEBA-F5.csv' })).toHaveCount(0);
});
