---
type: 'Task Contract'
title: 'Tool del agente: apply_promotion'
description: 'Wrapper AgentTool que confirma una promocion vinculada sugerida: re-valida la regla contra el carrito actual, agrega el producto con descuento y marca la promocion activa en el carrito.'
tags: ['ccdd', 'agent', 'promotions', 'cart', 'tool']
language: typescript

task: agent_tool_apply_promotion
intent: "Aplicar al carrito una promocion vinculada ya confirmada."
target: src/agent/tools/apply_promotion.ts
signature: "function applyPromotionTool(cartDb: CartDb, promotionsDb: PromotionsDb, catalog: DbProduct[], conversationId: string): AgentTool"
test_command: "node --test src/agent/tools/apply_promotion.test.ts"
budget:
  cyclomatic_max: 10
  nesting_max: 3
tests: "src/agent/tools/apply_promotion.test.ts"
tests_sha256: "fe5315f5397fd30d2731208c6ccc661605333a1ce83ba347ad055799c7b75c0d"
touch_only: ['src/agent/tools/apply_promotion.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente apply_promotion

## Intent
Issue #9: "permitir que el usuario acepte o rechace una promocion sugerida;
nunca agregar productos ni descuentos sin confirmacion". Decision del
usuario sobre el MECANISMO: "confirmar agrega el producto B con descuento"
-- por eso esta tool, a diferencia de `apply_coupon.ts` (que solo persiste
un codigo), ADEMAS agrega el producto B al carrito en el mismo paso. Es el
UNICO punto donde una promocion vinculada pasa de "sugerida" (por
[agent-tool-check-promotions](./agent-tool-check-promotions.md), solo
lectura) a "aplicada" -- por eso re-valida TODO de nuevo (nunca confia en
que la sugerencia anterior siga vigente).

Reusa piezas ya contractadas: `addCartItem` de
[cart-cart-add-item](./cart-cart-add-item.md) para agregar el producto (mismo
mecanismo que `add_to_cart.ts`), `evaluatePromotion` de
[promotions-evaluate-promotion](./promotions-evaluate-promotion.md) para
validar y calcular el descuento, y `cartDb.setPromotionId` de
[cart-cart-db](./cart-cart-db.md) para marcar la promocion activa.

## Interface
```typescript
function applyPromotionTool(cartDb: CartDb, promotionsDb: PromotionsDb, catalog: DbProduct[], conversationId: string): AgentTool
```

## Invariants
- `name` es siempre `"apply_promotion"`; `parameters` exige
  `promotion_id: string` (`required: ["promotion_id"]`,
  `additionalProperties: false`).
- `execute({ promotion_id })`:
  - `promotion_id` no es un string -> `{ error: "promotion_id must be a
    string" }`, no toca nada.
  - `promotionsDb.getPromotion(promotion_id)` devuelve `null` -> `{ error:
    "promotion not found" }`, no toca nada.
  - La `Promotion` encontrada tiene `active: false` -> `{ error: "promotion
    not active" }`, no toca nada.
  - Lee el carrito via `cartDb.getCart(conversationId)` (si es `null`, usa
    un carrito vacio equivalente, mismo criterio que `add_to_cart.ts`).
    Resuelve el producto de descuento en `catalog` por `discountProductId`
    (`priceCents` o `null` si no se encuentra), y llama
    `evaluatePromotion(cart, rule, priceCents)`.
  - Si `evaluation.applicable` es `false` -> `{ error: evaluation.reason }`
    (por ejemplo "trigger product not in cart", "discount product price
    unknown"), no toca nada.
  - Si es aplicable: agrega el producto de descuento al carrito con
    `addCartItem(cart, { productId: discountProductId, name:
    product.name, quantity: 1, unitPriceCents: priceCents })` (mismo
    mecanismo de merge de `add_to_cart.ts`: si el producto ya estaba en el
    carrito, se SUMA 1 a su cantidad existente), guarda el carrito
    actualizado con `cartDb.saveCart` (estampando `updatedAt`), y LUEGO
    marca la promocion activa con `cartDb.setPromotionId(conversationId,
    promotion_id)`.
  - Devuelve `{ item, discount_cents: evaluation.discountCents, cart:
    summarizeCart(savedCart) }`, donde `item` es la entrada del producto de
    descuento ya guardada en el carrito.
- Nunca lanza.

## Examples
- Carrito con el producto trigger `"145"`, promocion activa
  `"145"->"193"` 50% off, `"193"` en catalogo a `5500` -> agrega `"193"`
  cantidad 1 al carrito, `cartDb.getPromotionId(conversationId)` pasa a ser
  el id de la promocion, devuelve `discount_cents: 2750`.
- El producto de descuento YA estaba en el carrito con cantidad 1 -> tras
  `apply_promotion`, su cantidad pasa a 2 (merge, no duplica la linea).
- `promotion_id` que no existe -> `{ error: "promotion not found" }`.
- Promocion desactivada -> `{ error: "promotion not active" }`.
- Carrito sin el producto trigger -> `{ error: "trigger product not in
  cart" }`.
- `discountProductId` de la regla no esta en `catalog` -> `{ error:
  "discount product price unknown" }`.

## Do / Don't
- DO: re-evaluar la promocion con `evaluatePromotion` en cada llamada --
  nunca confiar en un resultado previo de `check_promotions`.
- DO: escribir el carrito ANTES de marcar `setPromotionId` -- si
  `addCartItem`/`saveCart` fallara, la promocion no debe quedar marcada
  sobre un carrito que no la refleja.
- DON'T: reimplementar el merge de cantidad -- usar `addCartItem`
  (`cart_add_item.ts`) tal cual, igual que `add_to_cart.ts`.
- DON'T: validar aca si el cupon aplicado (si hubiera uno) es compatible
  con esta promocion -- esa combinacion la resuelve
  [promotions-combine-discounts](./promotions-combine-discounts.md) al
  mostrar el carrito, no al aplicar la promocion.

## Tests
(Los tests estan en `src/agent/tools/apply_promotion.test.ts`, oraculo
congelado con `node:test`, usando `openCartDb(":memory:")` y
`openPromotionsDb(":memory:")` reales (ya verificados) y un catalogo fijo
en memoria -- sin red.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/apply_promotion.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/apply_promotion.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
