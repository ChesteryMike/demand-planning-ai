# Guion del video (máximo 3:00)

Tres partes: **problema (0:30) → demo en vivo (1:45) → cómo lo construimos (0:45)**. La demo en vivo se graba **contra la URL pública**, nunca contra localhost: https://demand-planning-ai.onrender.com

## Antes de grabar (lista de control)

1. **Abrir la URL 5 minutos antes.** El plan gratuito de Render se apaga tras 15 minutos sin visitas y tarda cerca de 1 minuto en despertar. Supabase gratuito también se pausa tras 1 semana sin uso.
2. **Restaurar la demo** con el botón "Restaurar datos de ejemplo" del Panel, justo antes de grabar. Así el Panel muestra los cinco niveles y las ventas llegan hasta "ayer".
3. **Dejar a mano** el texto de la demo (abajo) en un archivo de notas, para pegarlo sin tipear.
4. Navegador en pantalla completa, zoom al 110 % y sin pestañas personales a la vista.
5. **Medir la duración con el reproductor** (debe ser ≤ 3:00): no estimarla.
6. **Al terminar, restaurar la demo de nuevo**, porque la grabación guarda una importación y un pedido de prueba.

## Parte 1 · El problema (0:00 – 0:30)

*Pantalla: el Panel de la app, quieto.*

> "Una panadería, un almacén o un minimarket compran a ojo. No saben cuánto demora cada proveedor en entregar, así que se quedan sin producto justo cuando más venden, o les sobra mercadería que se vence. Demand Planning AI resuelve eso: sube lo que ya tienes, ya sea un Excel, un PDF del proveedor o un texto de WhatsApp, y te dice qué pedir y cuándo, con el motivo en palabras simples."

## Parte 2 · Demo en vivo (0:30 – 2:15)

| Tiempo | Pantalla | Qué decir y qué hacer |
|---|---|---|
| 0:30 – 0:50 | **Panel** | "Este es el negocio de demostración: la Panadería Don Aldo. Arriba, cuántos productos están en quiebre, en merma o sobrestock. Abajo, las alertas por urgencia." Abrir la alerta de **Marraqueta**: leer el motivo ("Usted repone este producto el mismo día… hoy le alcanza para 0,5 días"). |
| 0:50 – 1:25 | **Ventas → Ingreso** | "Ahora cargo ventas copiadas de WhatsApp." Pegar el **texto de la demo** y pulsar *Leer texto*. "La IA separa las filas, pero **copia los valores tal como aparecen**: las fechas y cantidades las convierte el código." Mostrar la vista previa: **3 filas válidas**, **2 excluidas con su motivo** (fecha sin año, cantidad en palabras) y el producto nuevo marcado **"Se crearán"**. Pulsar *Guardar* y abrir el enlace a la ficha del producto nuevo ("Faltan datos"). |
| 1:25 – 1:45 | **Plan de reposición** | "El plan dice cuánto y cuándo pedir. Estas cifras no las inventa la IA: salen de funciones testeadas." Señalar nivel, *Pedir* y *Cuándo*. Pulsar **Marcar pedido realizado** en Marraqueta y mostrar que pasa a "en camino". |
| 1:45 – 2:05 | **Pronóstico** | "Aquí, el historial de 28 días y el pronóstico de 14, con su rango." Pulsar **Revisar con IA**: "La IA solo puede sugerir un ajuste pequeño, y el código lo descarta si no se apoya en fechas reales." Leer la explicación sin jerga. |
| 2:05 – 2:15 | **Celular** | Abrir las herramientas del navegador a **375 px**: "Y funciona en el celular, donde el encargado carga las ventas." Mostrar el botón *Menú* y las tarjetas del Plan. |

### Texto de la demo (para pegar en *Ventas → Ingreso*)

```
Ventas de la semana
03-03-2026 Marraqueta 45
4/3/26 marraqueta 50
05-03 Hallulla 30
06-03-2026 Leche entera 1L doce
07.03.2026 Hallulla 1.250
08-11-2026 Queque de naranja 8
```

Resultado esperado: **4 filas válidas** (las 3 de siempre más el queque), **2 excluidas** («05-03» sin año y «doce» no es un número) y **1 producto nuevo**. Si la IA tarda más de unos segundos, esperar: en Render gratuito la primera respuesta puede demorar.

## Parte 3 · Cómo lo construimos (2:15 – 3:00)

*Pantalla: `docs/MEJORA_PROMPTS.md` (tabla v1, v2 y v3) y luego el repositorio en GitHub con el CI en verde.*

> "Lo construimos con un prompt maestro: un documento de reglas de negocio, casos de control exactos y puntos de control, que seguimos fase por fase. El principio rector es que **la IA interpreta y el código calcula**. Para medir la IA armamos un **golden set** de siete casos, con tres repeticiones por versión del prompt. La primera versión **obedeció una instrucción escondida en el texto** y agregó mil ventas falsas. Con la versión tres aprobamos los siete casos, con cero filas inventadas, a unos tres centésimos de centavo de dólar por llamada. El código tiene más de doscientos tests, un CI que además busca claves filtradas, y se despliega en Docker. Gracias."

## Duración estimada

A unas 150 palabras por minuto, el texto hablado mide unos **28 s** en la parte 1, unos **51 s** de voz repartidos en los 1:45 de la demo (el resto son acciones en pantalla) y unos **45 s** en la parte 3. Es una estimación: **hay que medir el video terminado con el reproductor**.
