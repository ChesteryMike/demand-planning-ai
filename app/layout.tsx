import type { Metadata, Viewport } from 'next';
import { Navegacion } from '@/components/navegacion';
import { leerNegocio } from '@/lib/datos';
import { negocioActivo } from '@/lib/negocio-activo';
import './globals.css';

// Todas las vistas leen Supabase al pedirlas: nada se prerenderiza en el build (8.1).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Demand Planning AI',
  description: 'Qué y cuándo comprar, a partir de sus propias ventas.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const negocio = await negocioActivo();
  // Si la base no responde, la navegación igual se muestra y la vista explica el error.
  const datos = await leerNegocio(negocio.businessId).catch(() => null);

  return (
    <html lang="es-CL">
      <body className="min-h-dvh antialiased">
        <Navegacion nombreNegocio={datos?.nombre ?? 'Demand Planning AI'} esDemo={negocio.esDemo} />
        <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
