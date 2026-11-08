import { PaginaMovimientosServidor } from '@/components/pagina-movimientos-servidor';

export const metadata = { title: 'Compras · Demand Planning AI' };

export default function Compras() {
  return <PaginaMovimientosServidor tipo="compra" />;
}
