# Despliegue en la nube (Fase 8): guía paso a paso, al menor costo

> **¿No tienen una cuenta de Google Cloud con facturación?** Los pasos 4 a 6 de esta guía (Google Cloud) se reemplazan por [DESPLIEGUE-RENDER.md](DESPLIEGUE-RENDER.md), que no requiere tarjeta. Los pasos 1 a 3 y el 7 son iguales.

Esta guía es para el integrante del Grupo 9 que configure las consolas. Se sigue en orden y, en cada paso, dice **qué hacer**, **el valor exacto de cada campo** y **la opción más barata** que respeta el PROMPT_MAESTRO (8.2 y 8.3).

> **Regla de oro:** ninguna clave se pega en el chat, en un commit ni en una captura. Las claves van solo en Secret Manager, en Supabase y en tu `.env` local.

## Resumen de costos

| Servicio | Opción más barata | Costo esperado |
|---|---|---|
| IA (Anthropic, `claude-haiku-5-5`) | Límite de gasto **US$ 5/mes** (el documento propone US$ 10; con Haiku alcanza con 5) | Cerca de US$ 0. **Máximo teórico ≈ US$ 4,5/mes**: 500 llamadas/día (tope global) × 30 días × ≈ US$ 0,0003 por llamada, medido en el golden set |
| Supabase | Plan **Free** | US$ 0 (hasta 2 proyectos activos y 500 MB de base) |
| Cloud Run | Mínimo 0 instancias, facturación **Request-based** | Probablemente US$ 0 dentro de la capa gratuita. Verificar en <https://cloud.google.com/run/pricing> |
| Artifact Registry | Limpieza automática: **guardar solo las 2 imágenes más recientes** | Centavos o US$ 0. Cada imagen pesa ≈ 344 MB |
| Cloud Build | Solo se construye al entrar un PR a `main` | Probablemente US$ 0 dentro de la capa gratuita. Verificar en <https://cloud.google.com/build/pricing> |
| Secret Manager | Solo 3 secretos, una versión cada uno | Centavos o US$ 0. Verificar en <https://cloud.google.com/secret-manager/pricing> |
| Presupuesto de GCP | Alerta en **US$ 5/mes** | US$ 0 (avisa, no corta) |

Los topes que **sí cortan el gasto** son tres: el máximo de 2 instancias de Cloud Run, los topes diarios de IA del código (`TOPE_DIARIO_IA` 200 y `TOPE_DIARIO_IA_GLOBAL` 500) y el límite de gasto de Anthropic.

---

## Paso 1 · Anthropic: límite de gasto y clave exclusiva (8.2)

Anthropic aplica **dos niveles de límite**: el de la organización, que alcanza a todo el gasto de la cuenta (por ejemplo, el uso de Claude Code), y el de cada espacio de trabajo. **El espacio de trabajo por defecto no admite límite propio**, así que la app necesita uno dedicado.

1. **Crear un espacio de trabajo propio:** en <https://platform.claude.com/settings/workspaces> → **Add Workspace**, con nombre `demand-planning-ai`.
2. **Límite del espacio de trabajo:** en <https://platform.claude.com/settings/spend-limits>, sección *Límites del espacio de trabajo*, elegir `demand-planning-ai` → **Establecer límite** → **US$ 5**. Este es el tope que corta el gasto de la app.
3. **Revisar el límite de la organización** (misma pantalla, arriba). **Si está al 100 % utilizado, todas las llamadas de la app serán rechazadas aunque su espacio de trabajo tenga saldo**, porque el límite de la organización se sigue aplicando. Debe quedar por encima del gasto actual más US$ 5; por ejemplo, si el mes lleva US$ 34, un límite de US$ 45 o más. Ese monto lo decide el grupo: sube el techo de gasto de toda la cuenta, no solo el de la app.
4. **Clave exclusiva:** en *API Keys → Create Key*, elegir el espacio de trabajo `demand-planning-ai` y nombrarla `produccion`. Copiarla una sola vez: va directo a Secret Manager en el paso 4. **No reutilizar la clave de Claude Code ni la que está en el `.env` local.**
5. **Captura:** la pantalla *Límites de gasto* con `demand-planning-ai` seleccionado, su límite de US$ 5 visible y el uso **por debajo del 100 %**, **sin ninguna clave en pantalla**. Guardarla como `docs/evidencias/limite-gasto.png` (con minúscula y guion, tal como lo pide el PROMPT_MAESTRO).

## Paso 2 · Supabase en la nube (plan Free)

1. En <https://supabase.com/dashboard> → **New project**:
   - **Name:** `demand-planning-ai`
   - **Database password:** una contraseña larga. Guardarla en un gestor de contraseñas; la necesitamos en el paso 3.
   - **Region:** **South America (São Paulo)**. Supabase no tiene región en Santiago y São Paulo es la más cercana.
   - **Plan:** Free.
2. Una vez creado, en **Authentication → Sign In / Providers → Email**, **desactivar "Confirm email"**. Lo exige la Fase 9 (6.13) y lo dejamos listo de una vez.
3. En **Project Settings → API** quedan tres valores que se usan en el paso 4:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** → `SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (secreto)
4. Avisar a Claude el **Project ref**, la parte `xxxx` de `https://xxxx.supabase.co`. No es secreto.

> **Atención:** un proyecto Free **se pausa tras 1 semana sin actividad**. El jueves 12, el día antes de la corrección, hay que abrir la URL pública para despertarlo.

## Paso 3 · Migraciones en la Supabase remota (lo hace Claude, con tu confirmación)

1. En **tu** terminal, una vez: `npx supabase login` (abre el navegador).
2. Crear en la raíz del proyecto un archivo `.env.supabase-remota` con una línea `SUPABASE_DB_PASSWORD=<contraseña del paso 2>`. Git lo ignora, porque calza con `.env*`.
3. Claude te mostrará y ejecutará, con tu confirmación:
   - `npx supabase link --project-ref <ref>`
   - `npx supabase db push`, que aplica las 6 migraciones.
   - La carga de la demo con `restaurar_demo()`.
   - Las consultas de verificación de la Fase 1 contra la base remota.

## Paso 4 · Google Cloud: proyecto, presupuesto y secretos

1. Crear un **proyecto nuevo** solo para esta app (por ejemplo `demand-planning-ai-g9`), con **facturación activa**. Si la cuenta institucional bloquea el acceso público, usar una cuenta personal (8.3).
2. **Presupuesto:** Facturación → Presupuestos y alertas → Crear presupuesto:
   - **Alcance:** solo este proyecto.
   - **Monto:** **US$ 5** mensuales.
   - **Alertas:** 50 %, 90 % y 100 %, por correo.
   - **Captura:** `docs/evidencias/presupuesto-gcp.png`.
3. **Secret Manager** (Seguridad → Secret Manager → Crear secreto). Crear **3 secretos, una sola versión cada uno**:

   | Nombre del secreto | Valor |
   |---|---|
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role del paso 2 |
   | `ANTHROPIC_API_KEY` | la clave nueva del paso 1 |
   | `SAL_IP` | una cadena aleatoria larga, por ejemplo 64 caracteres hex. **No** reutilizar la del `.env` local |

   Región de replicación: **automática**. Para ahorrar, no crear versiones extra: cada versión activa cuenta en el cobro.

## Paso 5 · Cloud Run: servicio con despliegue continuo desde `main`

En Cloud Run → **Crear servicio** → **Implementar continuamente desde un repositorio (GitHub)** → **Configurar con Cloud Build**:

| Campo | Valor |
|---|---|
| Proveedor / repositorio | GitHub → `ChesteryMike/demand-planning-ai` (autorizar la app de Cloud Build en GitHub si lo pide) |
| Rama | `^main$` |
| Tipo de compilación | **Dockerfile**, ubicación `/Dockerfile` |
| Nombre del servicio | `demand-planning-ai` |
| Región | **`southamerica-west1` (Santiago)**, exigida por 8.3 |
| Autenticación | **Permitir invocaciones sin autenticar** (la demo se abre sin login) |
| Facturación | **Request-based**, la opción por defecto: solo cobra mientras atiende solicitudes. **No** usar Instance-based |
| Escalamiento | **Mínimo 0** instancias (lo más barato; la primera visita tras un rato tarda unos segundos) y **máximo 2** |
| Memoria / CPU | **512 MiB** y **1 vCPU** |
| Aumento de CPU al iniciar (startup CPU boost) | **Desactivado**, para ahorrar |
| Puerto del contenedor | `3000`. Cloud Run define `PORT` y la imagen lo respeta |

**Variables y secretos** (pestaña *Contenedor → Variables y secretos*):

| Tipo | Nombre | Valor |
|---|---|---|
| Variable | `SUPABASE_URL` | Project URL del paso 2 |
| Variable | `SUPABASE_ANON_KEY` | anon public del paso 2 |
| Variable | `PROVEEDOR_IA` | `anthropic` |
| Variable | `MODELO_IA` | `claude-haiku-5-5` |
| Variable | `TOPE_DIARIO_IA` | `200` |
| Variable | `TOPE_DIARIO_IA_GLOBAL` | `500` |
| **Referencia a secreto** | `SUPABASE_SERVICE_ROLE_KEY` | secreto `SUPABASE_SERVICE_ROLE_KEY`, **versión `1`** (no `latest`) |
| **Referencia a secreto** | `ANTHROPIC_API_KEY` | secreto `ANTHROPIC_API_KEY`, **versión `1`** |
| **Referencia a secreto** | `SAL_IP` | secreto `SAL_IP`, **versión `1`** |

Si la consola ofrece **dar acceso a la cuenta de servicio** a los secretos, aceptar. Cambiar un secreto más adelante exige publicar una revisión nueva.

**Capturas (sin valores de claves):**
- `docs/evidencias/cloud-run-variables.png`: pestaña *Variables y secretos*, con los secretos como referencias a Secret Manager.
- `docs/evidencias/cloud-run-seguridad.png`: *Seguridad*, con las invocaciones sin autenticar.
- `docs/evidencias/cloud-run-escalamiento.png`: región `southamerica-west1`, mínimo 0 y máximo 2.

## Paso 6 · Artifact Registry: borrar imágenes viejas (ahorro)

Cada despliegue deja una imagen de ≈ 344 MB. Para no acumular almacenamiento, en **Artifact Registry → repositorio `cloud-run-source-deploy` (región `southamerica-west1`) → Editar → Políticas de limpieza**:

1. **Política de eliminación:** nombre `borrar-todo`, estado de etiqueta **Cualquiera**. Marca todas las versiones como candidatas a borrar.
2. **Política de conservación:** tipo **Keep most recent versions**, **Keep count = 2**. Protege las 2 más recientes.
3. Desmarcar **Dry run** para que se aplique de verdad. Los cambios se aplican en aproximadamente un día.

## Paso 7 · GitHub: proteger `main` (lo hace Claude con `gh`, con tu confirmación)

Regla para `main` que exige el workflow **CI** en verde antes de aceptar un PR y bloquea el push directo. Es gratis en repositorios públicos. Desde ese momento, cada cambio entra por pull request y Cloud Build solo construye cuando se fusiona uno.

## Paso 8 · Verificación (lo hace Claude)

Con la URL `*.run.app` del servicio, Claude ejecuta las condiciones (a)–(h) de la Fase 8:
- `curl` a las seis vistas.
- Página 404 en español.
- La IA activa con el texto G1.
- Playwright responsive con capturas en `docs/evidencias/responsive/`.
- El límite por IP (llamada 61 → 429) con datos `PRUEBA-` revertidos.
- La protección de rama.

Ustedes solo tienen que aportar las capturas de los pasos 1, 4 y 5.
