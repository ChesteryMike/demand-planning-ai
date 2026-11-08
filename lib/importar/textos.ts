/**
 * Textos del importador que también usa el navegador (sin dependencias de servidor).
 */
export const AVISO_PRODUCTOS_NO_SE_ELIMINAN = 'Los productos creados por esta importación no se eliminan.';

/** Confirmación de borrado de una importación completa (6.9). */
export function textoConfirmacionEliminar(filas: number): string {
  const borradas = filas === 1 ? 'Se borrará 1 fila.' : `Se borrarán ${filas} filas.`;
  return `${borradas} ${AVISO_PRODUCTOS_NO_SE_ELIMINAN}`;
}
