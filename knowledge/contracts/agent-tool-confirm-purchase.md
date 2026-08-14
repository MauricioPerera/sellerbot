---
type: 'Task Contract'
title: 'Tool del agente: confirm_purchase'
description: 'Wrapper AgentTool que convierte el carrito de la conversacion en una orden pending_payment con pay link, y vacia el carrito.'
tags: ['ccdd', 'agent', 'orders', 'cart', 'tool']
language: typescript

task: agent_tool_confirm_purchase
intent: "Convertir el carrito en una orden pending_payment con pay link."
target: src/agent/tools/confirm_purchase.ts
signature: "function confirmPurchaseTool(cartDb: CartDb, ordersDb: OrdersDb, coupons: Coupon[], conversationId: string): AgentTool"
test_command: "node --test src/agent/tools/confirm_purchase.test.ts"
budget:
  cyclomatic_max: 12
  nesting_max: 3
tests: "src/agent/tools/confirm_purchase.test.ts"
tests_sha256: "e5c653815fd56b8b4e11a01210684752530f4e41f86b524e6a0909cbb003f94e"
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

## Interface
```typescript
function confirmPurchaseTool(cartDb: CartDb, ordersDb: OrdersDb, coupons: Coupon[], conversationId: string): AgentTool
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
- Antes de crear la orden, lee `cartDb.getCouponCode(conversationId)`:
  - Si es `null`, no hay descuento -- sigue igual que antes de issue #6.
  - Si hay un codigo, lo busca en `coupons` (`coupons.find(c => c.code ===
    code)`) y lo re-evalua con `evaluateCoupon(cart, coupon, new
    Date().toISOString())`. Si el codigo no resuelve a ningun cupon de
    `coupons`, o `evaluateCoupon` devuelve `valid: false`, se ignora en
    silencio (SIN error, sin descuento) -- mismo patron de auto-sanacion de
    `view_cart`.
  - Si es valido, `discountCents = evaluation.discountCents` y el total final
    a persistir es `summary.totalCents - discountCents`.
- Con un carrito valido y con precio: llama
  `ordersDb.createOrder(conversationId, cart.items, finalTotalCents, coupon ?
  { code, discountCents } : null)` (donde `finalTotalCents` es
  `summary.totalCents` sin cambios si no hubo descuento aplicable), y LUEGO
  vacia el carrito con `cartDb.saveCart({ conversationId, items: [],
  updatedAt: new Date().toISOString() })` Y limpia el cupon con
  `cartDb.setCouponCode(conversationId, null)` (una confirmacion exitosa
  consume tanto el carrito como el cupon -- la proxima compra empieza de
  cero, sin arrastrar un descuento viejo).
- Devuelve `{ order_id: order.id, pay_url: "/pay/" + order.payToken,
  total_cents: order.totalCents }` (el `pay_url` es una ruta relativa; la
  pagina de pago mock que la sirve es un batch posterior -- esta tool solo
  genera el link, no lo atiende). Cuando se aplico un descuento, el objeto
  devuelto ADEMAS incluye `discount_cents` y `coupon_code`; cuando no hubo
  descuento (sin cupon, o cupon invalido/ignorado), esas dos claves estan
  AUSENTES del objeto devuelto (no `null`, ausentes).
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

## Do / Don't
- DO: vaciar el carrito SOLO despues de que `createOrder` haya tenido exito
  (si `createOrder` lanzara, el carrito debe quedar intacto).
- DO: pasar `cart.items` tal cual a `createOrder` -- son ya el snapshot de
  producto/cantidad/precio que la orden necesita conservar.
- DO: re-evaluar el cupon con `evaluateCoupon` en el momento de confirmar,
  nunca confiar en un `discountCents` calculado antes (por `view_cart` o
  `apply_coupon`) -- el carrito o la vigencia del cupon pudieron cambiar.
- DON'T: reimplementar el calculo de total -- usar `summarizeCart`
  (`cart_summary.ts`) para evitar recalcular con logica distinta.
- DON'T: implementar la pagina/ruta HTTP de pago aca -- esta tool solo arma
  el string del link.
- DON'T: devolver un error si el cupon aplicado ya no es valido al momento
  de confirmar -- se ignora en silencio y la compra sigue sin descuento
  (mismo criterio de auto-sanacion que `view_cart`).

## Tests
(Los tests estan en `src/agent/tools/confirm_purchase.test.ts`, oraculo
congelado con `node:test`, usando `openCartDb(":memory:")` y
`openOrdersDb(":memory:")` -- sin red. 6 tests originales de issue #4, mas 3
tests nuevos de issue #6 batch 3 sobre aplicacion/limpieza/auto-sanacion del
cupon al confirmar.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/confirm_purchase.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/confirm_purchase.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
