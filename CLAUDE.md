# CLAUDE.md · Demand Planning AI

App web que ayuda a pymes chilenas (panaderías, almacenes, minimarkets) a decidir **cuánto y cuándo comprar** a partir de su historial de ventas y compras. La especificación completa está en [`PROMPT_MAESTRO.md`](PROMPT_MAESTRO.md); este archivo es el resumen operativo.

**Principio rector:** el modelo de IA interpreta texto y sugiere ajustes; **el código calcula y valida**. Ninguna cifra de stock, riesgo, fecha, cantidad o pronóstico base sale de un modelo de lenguaje.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript 5 (`strict`) · Tailwind 4 + shadcn/ui · zod · Supabase (Postgres + RLS) · Vitest · Playwright · Docker → Google Cloud Run. IA: Anthropic `claude-haiku-5-5` mediante el adaptador `lib/ia/`.

## Estructura

| Carpeta | Contenido |
|---|---|
| `app/` | Vistas (Panel, Ventas, Productos, Compras, Pronóstico, Plan) y rutas de API (`app/api/**/route.ts`) |
| `lib/` | Lógica pura y testeada: `planificacion.ts`, `stock.ts`, `fechas.ts`, `formato.ts`, `pronostico/`, `importar/` |
| `lib/ia/` | Adaptador de IA (`cliente.ts`, `anthropic.ts`, `openai.ts`), carga de prompts y tope diario |
| `prompts/` | Prompts de sistema versionados; `versiones.json` fija la versión activa |
| `golden_set/` | Casos del Normalizador y resultados medidos (ver `docs/MEJORA_PROMPTS.md`) |
| `supabase/` | Migraciones (esquema, RLS, funciones SQL) y `seed.sql` |
| `components/` | UI; `components/ui` es shadcn |
| `tests/` | Vitest (`tests/**/*.test.ts`) y Playwright (`tests/e2e`, no corre en CI) |
| `scripts/` | Golden set y consultas de verificación |

## Comandos

```bash
npm ci                                   # instalar (versiones exactas)
npx supabase start                       # Supabase local (requiere Docker Desktop)
npx supabase db reset                    # aplicar migraciones y cargar la demo
npm run dev                              # app en http://localhost:3000 (lee .env)
npx vitest run                           # tests unitarios y de rutas (sin IA real)
npx tsc --noEmit && npm run lint         # tipos y lint
npx playwright test responsive           # verificación responsive (con npm run dev corriendo)
npm run golden-set -- --version v3       # golden set contra la IA REAL (21 llamadas)
docker build -t demand-planning-ai .     # imagen de producción
docker run --env-file .env.docker -p 3000:3000 demand-planning-ai
```

`.env` se crea a partir de `.env.example` y nunca se sube a Git. Para la prueba en Docker, `SUPABASE_URL` debe apuntar a `http://host.docker.internal:54321`.

## Reglas de trabajo (PROMPT_MAESTRO, sección 9)

1. Prohibido escribir una llave real en el repositorio; las claves viven en `.env`, Secret Manager y Supabase.
2. La IA nunca calcula cifras de negocio; toda salida del modelo se valida con zod.
3. El riesgo de quiebre depende de la entrega del proveedor más el colchón, nunca de la vida útil.
4. Importar productos nuevos los crea por defecto; nunca una importación bloqueada sin explicación.
5. Toda verificación fija su condición exacta (datos de entrada y resultado esperado).
6. Las pruebas que escriben datos usan el prefijo `PRUEBA-`, se revierten y se confirman con una consulta real.
7. Código, nombres y comentarios en español; textos de la interfaz en español de Chile.
8. Versiones exactas en `package.json` (sin `^` ni `~`).
9. Antes de cerrar una fase, ejecutar sus verificaciones y mostrar la salida real.
10. Si un test falla, explicar la causa y corregir el código; cambiar un valor esperado solo con aprobación.
11. Mostrar cada comando de Git, Supabase o la nube antes de ejecutarlo y esperar confirmación.
12. Ante una contradicción o un vacío que obligue a inventar una regla de negocio, preguntar.
13. Nunca cambiar un caso del golden set para que una versión del prompt pase.
14. Los prompts de sistema viven solo en `/prompts`, con versión; nunca dentro del código.
15. Toda vista se diseña primero a 375 px y luego a 1280 px, y pasa la verificación responsive.
16. Ninguna fase posterior a la 8 puede dejar la URL pública con una pantalla de login.
