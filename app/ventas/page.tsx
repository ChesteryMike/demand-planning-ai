import { PaginaMovimientosServidor } from '@/components/pagina-movimientos-servidor';

export const metadata = { title: 'Ventas · Demand Planning AI' };

export default function Ventas() {
  return <PaginaMovimientosServidor tipo="venta" />;
}
