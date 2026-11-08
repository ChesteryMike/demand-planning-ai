import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Imagen Docker mínima (8.1): solo .next/standalone, .next/static, public y prompts.
  output: 'standalone',
  // Los prompts se leen del disco en tiempo de ejecución (6.8): se incluyen en el trazado.
  outputFileTracingIncludes: {
    '/api/**/*': ['./prompts/**/*'],
  },
  poweredByHeader: false,
};

export default nextConfig;
