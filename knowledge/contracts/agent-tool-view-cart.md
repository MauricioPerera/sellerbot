---
type: 'Task Contract'
title: 'Tool del agente: view_cart'
description: 'Wrapper AgentTool que devuelve el resumen actual del carrito de la conversacion (items, subtotales, total), incluyendo descuento si hay un cupon valido aplicado.'
tags: ['ccdd', 'agent', 'cart', 'coupons', 'tool']
language: typescript

task: agent_tool_view_cart
intent: "Exponer el resumen del carrito, con descuento si aplica."
target: src/agent/tools/view_cart.ts
signature: "function viewCartTool(cartDb: CartDb, coupons: Coupon[], promotionsDb: PromotionsDb, catalog: DbProduct[], conversationId: string): AgentTool"
test_command: "node --test src/agent/tools/view_cart.test.ts"
budget:
  cyclomatic_max: 10
  nesting_max: 3
tests: "src/agent/tools/view_cart.test.ts"
tests_sha256: "70d9cbe429750b714599dcf8ecc4253c66392ad8564ff2f6d626a3331fc060a0"
touch_only: ['src/agent/tools/view_cart.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente view_cart

## Intent
Issue #4: "cuando el usuario pregunte '¿que tengo en el carrito?', el agente
muestra un resumen claro con items, cantidades, subtotal y cualquier dato
pendiente". Puente de solo lectura entre [cart-cart-db](./cart-cart-db.md) y
[cart-cart-summary](./cart-cart-summary.md) -- a diferencia de las otras 3
tools del carrito, esta no tiene efecto secundario (no llama `saveCart`).

Issue #6 batch 2: "el detalle del carrito ... refleja items, descuentos y
total final". Si hay un cupon aplicado (`cartDb.getCouponCode`), esta tool
lo RE-EVALUA en el momento (nunca confia en un descuento cacheado -- el
carrito pudo cambiar desde que se aplico) via
[coupons-evaluate-coupon](./coupons-evaluate-coupon.md); si sigue siendo
valido, agrega los campos de descuento; si ya no lo es (cambio el carrito,
o el codigo ya no existe en `coupons`), se comporta EXACTAMENTE como si no
hubiera cupon aplicado -- no informa un error, simplemente omite los campos
extra (auto-sanacion silenciosa, sin tocar la base -- el cupon invalido NO
se borra automaticamente de `cartDb`, solo no se refleja en este resumen).

Issue #9 batch B: agrega el mismo tratamiento para una promocion vinculada
aplicada (`cartDb.getPromotionId`), Y la COMBINA con el cupon usando
[promotions-combine-discounts](./promotions-combine-discounts.md) (que ya
resuelve el stacking: el cupon gana si `appliesToPromotionalItems`
contradice `combinableWithCoupons`). `view_cart` gana dos parametros
nuevos: `promotionsDb: PromotionsDb` (para resolver el `id` guardado a una
`Promotion`) y `catalog: DbProduct[]` (para resolver el precio del
producto de descuento, igual que necesita
[agent-tool-apply-promotion](./agent-tool-apply-promotion.md)).

## Interface
```typescript
import type { Coupon } from "../coupons/evaluate_coupon.ts";
import type { PromotionsDb } from "../promotions/promotions_db.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";
function viewCartTool(cartDb: CartDb, coupons: Coupon[], promotionsDb: PromotionsDb, catalog: DbProduct[], conversationId: string): AgentTool
```

## Invariants
- `name` es siempre `"view_cart"`; `parameters` no exige ningun argumento
  (`required: []`, `additionalProperties: false`) -- el `conversationId` ya
  esta fijado por closure al construir la tool, no lo decide el modelo.
- `execute({})` lee el carrito via `cartDb.getCart(conversationId)`; si es
  `null` (conversacion sin carrito todavia), se trata como un carrito vacio
  (`{ items: [], totalCents: 0 }`) sin escribir nada en la base.
- Si `cartDb.getCouponCode(conversationId)` es `null`, O el codigo no
  coincide con ningun `coupons[i].code`, O `evaluateCoupon` sobre el
  carrito actual devuelve `valid: false`: el resultado es EXACTAMENTE
  `summarizeCart(cart)` sin campos adicionales (mismo shape que antes de
  este batch -- `{ items, totalCents }`, nada mas).
- Resuelve la promocion de forma analoga: si `cartDb.getPromotionId(id)` es
  `null`, o `promotionsDb.getPromotion(id)` devuelve `null`, o la
  `Promotion` encontrada tiene `active: false`, se trata como "sin
  promocion" (sin buscar en `catalog` siquiera). Si esta activa, resuelve
  el producto de descuento en `catalog` por `discountProductId`
  (`priceCents` o `null` si no aparece).
- Llama `combineDiscounts(cart, coupon, promotionRule, discountPriceCents,
  now)` (donde `coupon`/`promotionRule` son `null` si no se resolvieron
  segun lo anterior) y usa su resultado para decidir que campos agregar:
  - `result.couponApplicable === true` -> agrega `couponCode` (el codigo
    guardado) y `discountCents: result.couponDiscountCents`.
  - `result.promotionApplicable === true` -> agrega `promotionId` (el id
    guardado) y `promotionDiscountCents: result.promotionDiscountCents`.
  - Si NINGUNO de los dos es aplicable, el resultado es EXACTAMENTE
    `summarizeCart(cart)`, sin `finalTotalCents` ni ningun campo extra
    (identico al comportamiento pre-issue-#9).
  - Si AL MENOS uno es aplicable, agrega tambien
    `finalTotalCents: result.finalTotalCents`.
- Nunca lanza; nunca llama `cartDb.saveCart`, `setCouponCode` ni
  `setPromotionId` (sigue siendo de solo lectura, incluso cuando el cupon o
  la promocion aplicados ya no son validos).

## Examples
- Conversacion sin carrito -> `execute({})` -> `{ items: [], totalCents: 0 }`.
- Carrito con un item, sin cupon aplicado -> `{ items: [...],
  totalCents: 6900 }` (shape identico al de antes de issue #6).
- Carrito con un item y `"WELCOME10"` (10%) aplicado y valido -> `{
  items: [...], totalCents: 6900, couponCode: "WELCOME10", discountCents:
  690, finalTotalCents: 6210 }`.
- Cupon aplicado pero que ya no cumple su minimo de compra (el carrito
  cambio) -> el resultado NO incluye `couponCode`/`discountCents`/
  `finalTotalCents`, igual que si no hubiera cupon.
- Cupon aplicado cuyo codigo ya no existe en `coupons` (dataset cambio) ->
  mismo comportamiento: se omite silenciosamente.
- Promocion aplicada y activa (50% sobre un item de `5500`), sin cupon ->
  `{ ...summary, promotionId, promotionDiscountCents: 2750,
  finalTotalCents: totalCents - 2750 }` (sin `couponCode`).
- Promocion desactivada tras aplicarse -> se omite igual que un cupon
  invalido, el resultado vuelve a ser `summarizeCart(cart)` sin campos
  extra.
- Cupon Y promocion aplicados, `appliesToPromotionalItems: true` -> ambos
  descuentos se suman en `finalTotalCents`.
- Cupon Y promocion aplicados, `appliesToPromotionalItems: false` -> el
  item promocionado se excluye del calculo del cupon (subtotal elegible
  menor), pero la promocion sigue aplicando su propio descuento igual.

## Do / Don't
- DO: delegar el calculo de subtotales/total a `summarizeCart`
  (`cart_summary.ts`) -- esta tool solo hace el fetch y pasa el resultado.
- DO: re-evaluar el cupon Y la promocion en cada llamada (via
  `combineDiscounts`), usando `new Date().toISOString()` como `now` --
  nunca confiar en que siguen siendo validos solo porque estan guardados.
- DON'T: llamar `cartDb.saveCart`, `setCouponCode` ni `setPromotionId`
  desde aca -- `view_cart` sigue siendo de solo lectura, incluso para
  "limpiar" un cupon o promocion invalidos.
- DON'T: reimplementar la logica de stacking aca -- usar
  `combineDiscounts` tal cual (`promotions/combine_discounts.ts`).
- DON'T: formatear moneda ARS aca -- el resultado en centavos es
  responsabilidad de capas superiores.

## Tests
(Los tests estan en `src/agent/tools/view_cart.test.ts`, oraculo congelado con
`node:test`, usando `openCartDb(":memory:")` y `openPromotionsDb(":memory:")`
reales -- sin red. Cubre el shape original sin cupon (4 tests de issue #4)
mas los 3 casos con cupon (issue #6), mas 5 tests nuevos de issue #9:
promocion valida sola, promocion desactivada, promocion con id inexistente,
y ambos combinados con y sin `appliesToPromotionalItems`.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/view_cart.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/view_cart.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
