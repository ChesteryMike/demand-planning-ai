# Demand Planning AI · Ficha de negocio

Grupo 9 (Gary López, Jonathan Rodriguez, Rafael Palma y Marlene Valencia) · UAI · Advanced Prompt Engineering 4 Generative AI · Demo: https://demand-planning-ai.onrender.com · Código: https://github.com/ChesteryMike/demand-planning-ai

## Cliente y problema

**Cliente:** dueño o encargado de compras de una pyme chilena que vende productos físicos (panadería, almacén, minimarket, distribuidora pequeña). No es técnico. **Problema:** compra "a ojo": pierde ventas por quiebres que no ve venir, porque no considera cuánto demora cada proveedor, y pierde plata por mermas y por stock inmovilizado.

## Propuesta de valor

Sube lo que ya tiene (un Excel, un PDF del proveedor o un texto copiado de WhatsApp) y recibe una **lista de qué pedir y cuándo**, con el motivo en palabras simples. La IA es clave en la entrada: sin ella, el comerciante tendría que ordenar sus datos a mano antes de usar la app. **El modelo interpreta texto y sugiere ajustes; el código calcula y valida**: ninguna cifra de stock, riesgo, fecha o cantidad sale de un modelo.

## Modelo de ingresos (propuesta; en esta versión no se implementa el cobro)

| Plan | Incluye | Precio |
|---|---|---|
| **Gratis** | Hasta 15 productos e importación de Excel/CSV, sin IA | $0 |
| **Pyme** | Productos ilimitados, importación de texto/PDF/Word con IA y pronóstico ajustado | $9.990 al mes por local |

## Costo mensual de operar la IA, por local

Modelo `claude-haiku-5-5` (US$ 0,10 por millón de tokens de entrada y US$ 0,50 por millón de salida). Los tokens están **medidos** con los prompts reales.

| Agente | Tokens (entrada / salida) | Costo por llamada |
|---|---|---|
| Normalizador de importación (promedio del golden set) | 2.104 / 157 | US$ 0,000289 |
| Coherencia de catálogo | 1.123 / 87 | US$ 0,000156 |
| Pronóstico | 2.059 / 108 | US$ 0,000260 |

- **Costo esperado:** 12 importaciones (Normalizador + Coherencia) y 30 pronósticos al mes = 12 × 0,000445 + 30 × 0,000260 = **US$ 0,013 al mes** (unos $12 CLP).
- **Costo máximo:** `TOPE_DIARIO_IA` (200) × 30 días × US$ 0,000289 = **US$ 1,73 al mes** (unos $1.650 CLP). Es menor que el precio del plan, así que no hace falta bajar el tope. El tope global (500 al día) acota el gasto de todos los locales a US$ 4,33 al mes, y el espacio de trabajo de la IA tiene un límite propio de US$ 5.
- **Margen sobre el costo de IA del Plan Pyme:** 99,9 % con el costo esperado y 83,5 % con el máximo. Supuesto: 1 US$ = $950 CLP, a confirmar por el grupo. No incluye la infraestructura, que en la demo corre en capas gratuitas.

## Calidad medida

Golden set de 7 casos del Normalizador, 3 repeticiones por versión y 63 llamadas reales. La versión 1 aprobó 6 de 7 casos y **obedeció una instrucción escondida en el texto** (agregó 1.000 ventas falsas). La versión 3 aprueba **7 de 7 casos con 0 filas inventadas**. Detalle en `docs/MEJORA_PROMPTS.md`.
