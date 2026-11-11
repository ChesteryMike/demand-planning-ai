# Despliegue alternativo en Render (sin tarjeta ni cuenta de facturación)

Esta guía **reemplaza los pasos 4 a 6** de [DESPLIEGUE.md](DESPLIEGUE.md) (Google Cloud) cuando el grupo no tiene una cuenta con facturación. Los pasos 1 a 3 (Anthropic y Supabase) y el 7 (protección de `main`) no cambian.

Render construye la misma imagen Docker a partir del `Dockerfile` de la raíz, así que no hay que tocar el código de la app.

> **Regla de oro:** ninguna clave se pega en el chat, en un commit ni en una captura.

Los datos salen de la documentación oficial de Render, leída el 10-11-2026. Lo que **no pude confirmar** va marcado con ⚠️.

## Lo que hay que saber antes de empezar

| Límite del plan gratuito | Qué significa para la demo |
|---|---|
| Se apaga tras **15 minutos** sin visitas y tarda **cerca de 1 minuto** en despertar | La primera visita tras un rato carga lento. El día de la corrección y al grabar el video, abrir la URL unos minutos antes |
| **0,1 CPU y 512 MB** de memoria | Es poco: las páginas cargan más lento que en Cloud Run. La importación de PDF grandes podría quedarse sin memoria |
| Puede **reiniciarse en cualquier momento**; el disco no persiste | La app no escribe en disco, así que no afecta |
| **750 horas** gratuitas al mes y 1 sola instancia | Alcanza para un servicio. Sirve de tope natural, como el "máximo 2 instancias" de Cloud Run |
| **Sin región en Sudamérica** (Oregon, Ohio, Virginia, Frankfurt y Singapur) | Elegir Virginia. Cada consulta a Supabase (São Paulo) sumará algo de latencia |
| Si se agota el ancho de banda y no hay medio de pago, Render **suspende** el servicio gratuito el resto del mes | Para una demo es improbable |
| Su documentación pide no usar la instancia gratuita en producción | Es una demostración de curso, no un servicio comercial |

## Paso 0 · Cuenta

1. Entrar a <https://render.com> y registrarse con **GitHub**, usando una cuenta que tenga acceso al repositorio `ChesteryMike/demand-planning-ai` (el dueño o un colaborador).
2. ⚠️ La documentación no dice si pide tarjeta al registrarse o al crear un servicio gratuito. **Si en algún momento la pide, detenerse y avisar**: no la ingresen.
3. Si el repositorio no aparece al conectarlo, hay que autorizar la aplicación de Render para ese repositorio en GitHub. Con "Public Git Repository" (pegando solo la URL) **no hay despliegue automático**: solo manual. Por eso hay que conectar la cuenta de GitHub.

## Paso 1 · Crear el servicio web

Dashboard → **New** → **Web Service** → proveedor Git → repositorio `demand-planning-ai`:

| Campo | Valor |
|---|---|
| Nombre | `demand-planning-ai` |
| Rama | `main` |
| Lenguaje / entorno | **Docker** (usa el `Dockerfile` de la raíz, que es la ubicación por defecto) |
| Región | **Virginia (USA)**, la que suele quedar más cerca de Sudamérica entre las disponibles |
| Tipo de instancia | **Free** |
| **Auto-Deploy** | **After CI Checks Pass** |

**Por qué "After CI Checks Pass":** Render solo despliega cuando **todos** los chequeos del CI de GitHub Actions están en verde. Es el equivalente al control de calidad que queríamos: un cambio con errores no llega a la URL pública. Si un commit no trae ningún chequeo, Render no lo despliega.

## Paso 2 · Variables de entorno

Dentro del servicio, en el menú de la izquierda (grupo **Manage**), abrir **Environment** (si el menú se ve cortado, cerrar la tarjeta de novedades de abajo o alejar la página con `Ctrl` y `-`). También se llega directo con `https://dashboard.render.com/web/<ID del servicio>/env`. Pulsar **Edit** y agregar una variable por fila, con el **nombre en Key** y el **valor en Value** (nunca `NOMBRE=valor` dentro de Key).

`PORT` ya viene creada por Render: **no tocarla**. Con ella la app escucha en el puerto 10000, que es el que espera Render.

| Nombre | Valor |
|---|---|
| `SUPABASE_URL` | Project URL de Supabase |
| `SUPABASE_ANON_KEY` | anon public de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role de Supabase **(secreto)** |
| `PROVEEDOR_IA` | `anthropic` |
| `MODELO_IA` | `claude-haiku-5-5` |
| `ANTHROPIC_API_KEY` | la clave exclusiva del espacio de trabajo `demand-planning-ai` **(secreto)** |
| `TOPE_DIARIO_IA` | `200` |
| `TOPE_DIARIO_IA_GLOBAL` | `500` |
| `SAL_IP` | cadena aleatoria larga, distinta de la del `.env` local **(secreto)** |
| `IP_CLIENTE_ORIGEN` | `cabecera:cf-connecting-ip` **(obligatoria en Render, ver más abajo)** |

Al guardar, elegir **Save and deploy**: cambiar una variable no afecta lo que ya está ejecutándose, hace falta un despliegue nuevo. Render no tiene un administrador de secretos aparte: las tres claves viven aquí. Los valores se muestran como puntos y el ícono del ojo los revela: **no tomen capturas con los valores a la vista**.

**Si falta una variable, la app responde error 500** en todas las páginas que leen datos, y el registro (pestaña **Logs**) dice, por ejemplo, `Falta la variable de entorno SUPABASE_URL`. `SUPABASE_URL` debe ser `https://<Project ref>.supabase.co`.

**No copiar el `.env` local completo:** tiene valores de desarrollo (`SUPABASE_URL=http://127.0.0.1:54321`, claves de la base local y una clave de IA distinta).

## Paso 3 · Primer despliegue y URL

El primer despliegue construye la imagen y tarda unos minutos. La URL pública tiene la forma `https://demand-planning-ai-xxxx.onrender.com`. Esa es la URL que se entrega al profesor y sobre la que verifico la Fase 8.

## Paso 4 · Capturas para `docs/evidencias/`

Ninguna debe mostrar valores de claves:
- `render-despliegue.png`: la configuración del servicio con **Free**, la región y **After CI Checks Pass**.
- `render-variables.png`: la pestaña *Environment* con los **nombres** de las variables y los valores de las tres claves ocultos o tapados.
- No hay presupuesto de GCP que capturar: el plan es gratuito.

## Por qué `IP_CLIENTE_ORIGEN` es obligatoria en Render

El límite por IP (6.10) necesita saber la IP real del visitante. La documentación de Render no dice cómo llega, así que se midió en la URL pública el 11-11-2026. Delante de Render hay Cloudflare, y la cadena `x-forwarded-for` queda así:

| Petición | `x-forwarded-for` que recibe la app |
|---|---|
| Normal | `<cliente>, <Cloudflare>, <interna de Render>` |
| Con una cabecera `X-Forwarded-For` falsa | `<falsa>,<cliente>, <Cloudflare>, <interna de Render>` |

El cliente puede **anteponer** valores falsos, así que usar el primero (el comportamiento por defecto) permite esquivar el límite con solo cambiar la cabecera en cada llamada. En cambio, `cf-connecting-ip` la fija Cloudflare: una petición que la trae falsificada recibe un 403 antes de llegar a la app, y `true-client-ip` la sobrescribe con la IP real.

Por eso, en Render hay que agregar la variable **`IP_CLIENTE_ORIGEN`** con el valor **`cabecera:cf-connecting-ip`**. Si se olvida, la app sigue funcionando, pero el límite por IP se puede esquivar. Si se escribe mal, la IP queda "desconocida" para todos (un solo contador compartido) y nunca se vuelve al modo falsificable. Como alternativa existe `xff-desde-final:3`. Los topes diarios de IA y el límite de gasto de Anthropic acotan el gasto en cualquier caso.

## Pendientes

- **Cambios en el documento:** habrá que ajustar la sección 8.3 del `PROMPT_MAESTRO.md` y los nombres de las capturas, y conviene **avisar al profesor** de que se usa Render y no Cloud Run.
