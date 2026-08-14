---
type: 'Task Contract'
title: 'Tool del agente: check_promotions'
description: 'Wrapper AgentTool de solo lectura que lista las promociones vinculadas activas aplicables al carrito actual, con el descuento resuelto contra el catalogo -- nunca aplica nada.'
tags: ['ccdd', 'agent', 'promotions', 'cart', 'tool']
language: typescript

task: agent_tool_check_promotions
intent: "Informar promociones vinculadas aplicables al carrito, sin aplicarlas."
target: src/agent/tools/check_promotions.ts
signature: "function checkPromotionsTool(cartDb: CartDb, promotionsDb: PromotionsDb, catalog: DbProduct[], conversationId: string): AgentTool"
test_command: "node --test src/agent/tools/check_promotions.test.ts"
budget:
  cyclomatic_max: 10
  nesting_max: 3
tests: "src/agent/tools/check_promotions.test.ts"
tests_sha256: "4bd71586997cbda41bf33bcfb05a18c6cf8408c0ac5c4d1fe11057c3753e4db3"
touch_only: ['src/agent/tools/check_promotions.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente check_promotions

## Intent
Issue #9: "informar promociones relevantes durante la conversacion, por
ejemplo: 'con este producto, el segundo accesorio tiene descuento'" y
"permitir que el usuario acepte o rechace una promocion sugerida; nunca
agregar productos ni descuentos sin confirmacion". Esta tool es la mitad
"informar" -- de SOLO LECTURA, nunca escribe nada (ni el carrito, ni
`cartDb.setPromotionId`). El agente la llama (guiado por el system prompt)
despues de agregar un producto al carrito, para saber si hay una promocion
vinculada que valga la pena mencionar; la aplicacion real, tras
confirmacion explicita del usuario, es
[agent-tool-apply-promotion](./agent-tool-apply-promotion.md).

Puente entre [promotions-promotions-db](./promotions-promotions-db.md)
(reglas administrables), [promotions-evaluate-promotion](./promotions-evaluate-promotion.md)
(evaluacion pura) y el catalogo (para resolver nombre/precio del producto
B). Mismo patron de "tool wrapper delgado que resuelve dependencias y
delega el calculo" que `apply_coupon.ts`/`view_cart.ts`.

## Interface
```typescript
function checkPromotionsTool(cartDb: CartDb, promotionsDb: PromotionsDb, catalog: DbProduct[], conversationId: string): AgentTool
```

## Invariants
- `name` es siempre `"check_promotions"`; `parameters` no exige ningun
  argumento (`required: []`, `additionalProperties: false`).
- `execute({})` lee el carrito via `cartDb.getCart(conversationId)`. Si es
  `null` o `items.length === 0`, devuelve `{ promotions: [] }`.
- Toma TODAS las promociones de `promotionsDb.listPromotions()` con
  `active: true`, y de esas, las que tienen `triggerProductId` presente en
  `cart.items` (algun item con ese `productId`).
- Para cada una, resuelve el producto de descuento en `catalog` por
  `discountProductId`. Si no aparece en `catalog`, se EXCLUYE del
  resultado (no se puede sugerir un descuento sobre un producto sin
  precio/nombre resuelto).
- Si aparece, evalua con `evaluatePromotion(cart, rule,
  product.priceCents)`. Si `applicable` es `false` (deberia ser raro dado
  que ya se filtro por trigger presente y activa, pero puede pasar si
  `product.priceCents` es `null`), se EXCLUYE del resultado.
- Cada entrada incluida en `promotions` tiene: `promotion_id` (el `id` de
  la `Promotion`), `discount_product_id`, `discount_product_name` (de
  `catalog`), `discount_type`, `discount_value` (los de la regla, tal
  cual), y `discount_cents` (el `discountCents` de la evaluacion).
- El orden de `promotions` sigue el orden devuelto por
  `promotionsDb.listPromotions()` (mas nueva primero), filtrado.
- Nunca lanza; nunca modifica `cartDb`/`promotionsDb`/el carrito.

## Examples
- Carrito vacio -> `{ promotions: [] }`.
- Carrito con el producto `"145"` (trigger de una promocion activa hacia
  `"193"` al 50%, `"193"` con precio `5500` en catalogo) -> `{ promotions:
  [{ promotion_id: "...", discount_product_id: "193", discount_product_name:
  "Ajax Full-Zip Sweatshirt", discount_type: "percentage", discount_value:
  50, discount_cents: 2750 }] }`.
- Misma promocion pero desactivada (`active: false`) -> `{ promotions: [] }`.
- Carrito sin el producto trigger -> `{ promotions: [] }`.
- Promocion cuyo `discountProductId` no esta en `catalog` -> excluida.
- Dos promociones activas con el mismo trigger -> ambas en la lista.

## Do / Don't
- DO: filtrar por `active: true` ANTES de evaluar (no listar promociones
  desactivadas, ni siquiera con un discountCents calculado).
- DO: usar `evaluatePromotion` para el calculo -- no reimplementar
  porcentaje/fijo aca.
- DON'T: aplicar nada -- esta tool NUNCA llama
  `cartDb.setPromotionId`/`saveCart`. Aplicar es responsabilidad de
  `apply_promotion`, solo tras confirmacion explicita del usuario.
- DON'T: sugerir una promocion cuyo producto de descuento no se puede
  resolver (sin precio conocido) -- mejor omitirla que mostrar un
  descuento inventado o `null`.

## Tests
(Los tests estan en `src/agent/tools/check_promotions.test.ts`, oraculo
congelado con `node:test`, usando `openCartDb(":memory:")` y
`openPromotionsDb(":memory:")` reales (ya verificados) y un catalogo fijo
en memoria -- sin red.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/check_promotions.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/check_promotions.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
