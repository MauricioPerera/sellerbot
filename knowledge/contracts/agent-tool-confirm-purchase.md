---
type: 'Task Contract'
title: 'Tool del agente: confirm_purchase'
description: 'Wrapper AgentTool que convierte el carrito de la conversacion en una orden pending_payment con pay link, y vacia el carrito.'
tags: ['ccdd', 'agent', 'orders', 'cart', 'tool']
language: typescript

task: agent_tool_confirm_purchase
intent: "Convertir el carrito en una orden pending_payment con pay link."
target: src/agent/tools/confirm_purchase.ts
signature: "function confirmPurchaseTool(cartDb: CartDb, ordersDb: OrdersDb, coupons: Coupon[], promotionsDb: PromotionsDb, catalog: DbProduct[], conversationId: string): AgentTool"
test_command: "node --test src/agent/tools/confirm_purchase.test.ts"
budget:
  cyclomatic_max: 14
  nesting_max: 3
tests: "src/agent/tools/confirm_purchase.test.ts"
tests_sha256: "53244af361b29439efb11d3b7d4728d7b4ac88a09a53616b67942c89a22a3560"
touch_only: ['src/agent/tools/confirm_purchase.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente confirm_purchase

## Intent
Issue #4 (comentario carrito): "Solo una confirmacion explicita ... convierte
el carrito en una orden `pending_payment` y habilita la creacion del pay
link" y "una vez creada la orden, el carrito origen queda trazable en el
historial de la orden". Puente entre [cart-cart-summary](./cart-cart-summary.md)
(para el total), [orders-orders-db](./orders-orders-db.md) (para crear la
orden) y `cart_db.ts` (para vaciar el carrito tras confirmar). Es el UNICO
punto donde explorar productos/ajustar el carrito se convierte en una compra
real -- por eso valida agresivamente antes de crear nada.

Issue #6 batch 3 (aplicar el descuento al confirmar): el criterio de
aceptacion pide que "al crear la orden, se conserva un snapshot de items,
descuentos y total final". Este contrato AGREGA un tercer parametro
`coupons: Coupon[]` (mismo patron que ya usan `view_cart`/`apply_coupon`) y,
si la conversacion tiene un codigo de cupon aplicado
(`cartDb.getCouponCode`), lo RE-EVALUA en el momento de confirmar con
[coupons-evaluate-coupon](./coupons-evaluate-coupon.md) -- nunca confia en un
descuento calculado antes (el carrito pudo cambiar, el cupon pudo vencer
entre que se aplico y que se confirma). Mismo patron de "auto-sanacion" ya
usado en `view_cart` (batch 2): un codigo de cupon que ya no resuelve a un
cupon valido se ignora en silencio, sin error -- la compra sigue, sin
descuento.

Issue #9 batch C (aplicar tambien la promocion vinculada al confirmar):
mismo tratamiento EXACTO para una promocion vinculada aplicada
(`cartDb.getPromotionId`), combinado con el cupon usando
[promotions-combine-discounts](./promotions-combine-discounts.md) (la
misma funcion que ya usa `view_cart`, garantiza que el total mostrado antes
de confirmar y el total persistido en la orden sean CONSISTENTES). Gana dos
parametros nuevos: `promotionsDb: PromotionsDb` y `catalog: DbProduct[]`
(mismos tipos que `view_cart`/`apply_promotion`).

## Interface
```typescript
import type { Coupon } from "../coupons/evaluate_coupon.ts";
import type { PromotionsDb } from "../promotions/promotions_db.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";
function confirmPurchaseTool(cartDb: CartDb, ordersDb: OrdersDb, coupons: Coupon[], promotionsDb: PromotionsDb, catalog: DbProduct[], conversationId: string): AgentTool
```

## Invariants
- `name` es siempre `"confirm_purchase"`; `parameters` no exige ningun
  argumento (`required: []`, `additionalProperties: false`) -- opera sobre el
  carrito ya persistido de `conversationId`.
- `execute({})` lee el carrito via `cartDb.getCart(conversationId)`. Si es
  `null` o `items.length === 0`, devuelve `{ error: "cart is empty" }` sin
  crear ninguna orden.
- Calcula `summarizeCart(cart)`. Si `totalCents` es `null` (algun item no
  tiene precio cargado), devuelve `{ error: "cart has an item with no price,
  cannot confirm purchase" }` sin crear ninguna orden -- no se puede confirmar
  una compra con precio desconocido.
- Antes de crear la orden, resuelve cupon y promocion (SIN evaluarlos
  todavia):
  - Cupon: `cartDb.getCouponCode(conversationId)`; si no es `null`, lo
    busca en `coupons` (`coupons.find(c => c.code === code)`) -> `Coupon |
    null`.
  - Promocion: `cartDb.getPromotionId(conversationId)`; si no es `null`,
    `promotionsDb.getPromotion(id)`; si existe Y `active === true`, es la
    `PromotionRule` a usar (si no, `null`). Si hay una regla resuelta,
    busca el producto de descuento en `catalog` por `discountProductId`
    para su `priceCents` (o `null` si no aparece).
- Llama `combineDiscounts(cart, coupon, promotionRule, discountPriceCents,
  new Date().toISOString())` (misma funcion que usa `view_cart`) para
  obtener el resultado combinado.
- Con un carrito valido y con precio: llama
  `ordersDb.createOrder(conversationId, cart.items, result.finalTotalCents,
  result.couponApplicable ? { code, discountCents:
  result.couponDiscountCents } : null, result.promotionApplicable ? { id,
  discountCents: result.promotionDiscountCents } : null)`, y LUEGO vacia el
  carrito con `cartDb.saveCart({ conversationId, items: [], updatedAt: new
  Date().toISOString() })` Y limpia AMBOS slots con
  `cartDb.setCouponCode(conversationId, null)` y
  `cartDb.setPromotionId(conversationId, null)` (una confirmacion exitosa
  consume el carrito, el cupon Y la promocion -- la proxima compra empieza
  de cero, sin arrastrar descuentos viejos).
- Devuelve `{ order_id: order.id, pay_url: "/pay/" + order.payToken,
  total_cents: order.totalCents }` (el `pay_url` es una ruta relativa; la
  pagina de pago mock que la sirve es un batch posterior -- esta tool solo
  genera el link, no lo atiende). Cuando `result.couponApplicable` es
  `true`, el objeto devuelto ADEMAS incluye `discount_cents` y
  `coupon_code`; cuando `result.promotionApplicable` es `true`, ADEMAS
  incluye `promotion_discount_cents` y `promotion_id`. Cuando cualquiera de
  los dos NO aplica, sus claves correspondientes estan AUSENTES del objeto
  devuelto (no `null`, ausentes) -- independientes entre si.
- Nunca lanza.
- Cada `conversationId` genera ordenes independientes (delegado a `OrdersDb`).

## Examples
- Carrito con 2 items con precio, `execute({})` -> `{ order_id: "...",
  pay_url: "/pay/...", total_cents: 19300 }`; `ordersDb.getOrder(order_id)`
  tiene `status: "pending_payment"`; `cartDb.getCart(conversationId).items`
  queda `[]`.
- Carrito vacio -> `{ error: "cart is empty" }`.
- Carrito con un item sin precio -> `{ error: "cart has an item with no
  price, cannot confirm purchase" }`, el carrito NO se vacia, no se crea
  orden.
- Carrito de $193,00, cupon `"WELCOME10"` aplicado y valido (10% off) ->
  `{ order_id, pay_url, total_cents: 17370, discount_cents: 1930,
  coupon_code: "WELCOME10" }`; `ordersDb.getOrder(order_id)` tiene
  `totalCents: 17370, discountCents: 1930, couponCode: "WELCOME10"`; luego
  `cartDb.getCouponCode(conversationId)` es `null`.
- Carrito de $193,00, cupon `"EXPIRED"` aplicado pero que ya no resuelve a un
  cupon valido de `coupons` -> `{ order_id, pay_url, total_cents: 19300 }`
  (sin `discount_cents`/`coupon_code`, sin error); la orden queda con
  `discountCents: 0, couponCode: null`.
- Carrito con el producto trigger de una promocion activa (50% sobre un
  item de `5500` presente en el carrito, sin cupon) -> `{ order_id,
  pay_url, total_cents: 16550, promotion_discount_cents: 2750,
  promotion_id: "..." }`; la orden queda con `promotionDiscountCents: 2750,
  promotionId: "..."`; luego `cartDb.getPromotionId(conversationId)` es
  `null`.
- Promocion desactivada tras aplicarse -> se ignora en silencio, igual que
  un cupon invalido; `total_cents` vuelve al subtotal sin descuento, la
  orden queda con `promotionDiscountCents: 0, promotionId: null`.
- Cupon Y promocion aplicados y validos a la vez -> ambos descuentos se
  restan del `total_cents`, el objeto devuelto y la orden tienen los
  CUATRO campos (`discount_cents`/`coupon_code` y
  `promotion_discount_cents`/`promotion_id`).

## Do / Don't
- DO: vaciar el carrito SOLO despues de que `createOrder` haya tenido exito
  (si `createOrder` lanzara, el carrito debe quedar intacto).
- DO: pasar `cart.items` tal cual a `createOrder` -- son ya el snapshot de
  producto/cantidad/precio que la orden necesita conservar.
- DO: re-evaluar cupon Y promocion con `combineDiscounts` en el momento de
  confirmar, nunca confiar en un descuento calculado antes (por `view_cart`
  o `apply_coupon`/`apply_promotion`) -- el carrito, la vigencia del cupon,
  o el estado de la promocion pudieron cambiar.
- DON'T: reimplementar el calculo de total ni la logica de stacking --
  usar `summarizeCart` (via `combineDiscounts`) y `combineDiscounts`
  (`promotions/combine_discounts.ts`) tal cual.
- DON'T: implementar la pagina/ruta HTTP de pago aca -- esta tool solo arma
  el string del link.
- DON'T: devolver un error si el cupon o la promocion aplicados ya no son
  validos al momento de confirmar -- se ignoran en silencio y la compra
  sigue, cada uno independientemente (mismo criterio de auto-sanacion que
  `view_cart`).

## Tests
(Los tests estan en `src/agent/tools/confirm_purchase.test.ts`, oraculo
congelado con `node:test`, usando `openCartDb(":memory:")`,
`openOrdersDb(":memory:")` y `openPromotionsDb(":memory:")` reales -- sin
red. 6 tests originales de issue #4, 3 tests de issue #6 batch 3 sobre
aplicacion/limpieza/auto-sanacion del cupon, y 4 tests nuevos de issue #9
batch C sobre aplicacion/limpieza/auto-sanacion de la promocion y su
combinacion con el cupon.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/confirm_purchase.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/confirm_purchase.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
