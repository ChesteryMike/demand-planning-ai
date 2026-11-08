/**
 * Verificación de la Fase 6 (c): marcar y recibir un pedido de prueba en el
 * Plan. ESCRIBE DATOS: solo con INCLUIR_ESCRITURA=1 y --grep @escribe.
 * Identificador de la prueba: pedido de Marraqueta por 7,777 (cantidad que la
 * demo nunca usa). Se revierte con scripts/verificar-fase6-revertir.sql.
 */
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

test('(c) marcar pedido realizado y recibirlo en el Plan @escribe', async ({ page }) => {
  await page.goto('/plan');
  const fila = page.getByRole('table', { name: 'Plan de reposición' }).getByRole('row').filter({ hasText: 'Marraqueta' });
  await expect(fila.getByText('Quiebre')).toBeVisible();

  await fila.getByRole('button', { name: 'Marcar pedido realizado' }).click();
  await page.getByLabel(/Cantidad pedida/).fill('7,777');
  await page.getByRole('button', { name: 'Registrar pedido' }).click();
  await expect(fila.getByText('Pedido registrado: ahora cuenta como "en camino".')).toBeVisible();

  const recibir = fila.getByRole('button', { name: 'Recibir 7,777' });
  await expect(recibir).toBeVisible();
  await expect(fila.getByRole('cell', { name: '7,8', exact: true })).toBeVisible(); // en camino

  await recibir.click();
  await expect(page.getByLabel(/Cantidad recibida/)).toHaveValue('7,777');
  const confirmar = page.getByRole('button', { name: 'Confirmar recepción' });
  // Doble pulsación: la segunda no debe crear otra compra.
  await confirmar.dblclick();
  await expect(fila.getByText('Pedido recibido: se registró la compra.')).toBeVisible();
  await expect(fila.getByRole('button', { name: 'Recibir 7,777' })).toHaveCount(0);
});
