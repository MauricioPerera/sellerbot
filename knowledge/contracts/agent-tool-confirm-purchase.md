---
type: 'Task Contract'
title: 'Tool del agente: confirm_purchase'
description: 'Wrapper AgentTool que convierte el carrito de la conversacion en una orden pending_payment con pay link, y vacia el carrito.'
tags: ['ccdd', 'agent', 'orders', 'cart', 'tool']
language: typescript

task: agent_tool_confirm_purchase
intent: "Convertir el carrito en una orden pending_payment con pay link."
target: src/agent/tools/confirm_purchase.ts
signature: "function confirmPurchaseTool(cartDb: CartDb, ordersDb: OrdersDb, conversationId: string): AgentTool"
test_command: "node --test src/agent/tools/confirm_purchase.test.ts"
budget:
  cyclomatic_max: 8
  nesting_max: 3
tests: "src/agent/tools/confirm_purchase.test.ts"
tests_sha256: "c295b0a25ca31f937a0161b9720b4022f89c583a0c3628a6706a1ad20c9edee2"
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

## Interface
```typescript
function confirmPurchaseTool(cartDb: CartDb, ordersDb: OrdersDb, conversationId: string): AgentTool
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
- Con un carrito valido y con precio: llama
  `ordersDb.createOrder(conversationId, cart.items, summary.totalCents)`, y
  LUEGO vacia el carrito con `cartDb.saveCart({ conversationId, items: [],
  updatedAt: new Date().toISOString() })` (una confirmacion exitosa consume el
  carrito -- la proxima compra empieza de cero).
- Devuelve `{ order_id: order.id, pay_url: "/pay/" + order.payToken,
  total_cents: order.totalCents }` (el `pay_url` es una ruta relativa; la
  pagina de pago mock que la sirve es un batch posterior -- esta tool solo
  genera el link, no lo atiende).
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

## Do / Don't
- DO: vaciar el carrito SOLO despues de que `createOrder` haya tenido exito
  (si `createOrder` lanzara, el carrito debe quedar intacto).
- DO: pasar `cart.items` tal cual a `createOrder` -- son ya el snapshot de
  producto/cantidad/precio que la orden necesita conservar.
- DON'T: reimplementar el calculo de total -- usar `summarizeCart`
  (`cart_summary.ts`) para evitar recalcular con logica distinta.
- DON'T: implementar la pagina/ruta HTTP de pago aca -- esta tool solo arma
  el string del link.

## Tests
(Los tests estan en `src/agent/tools/confirm_purchase.test.ts`, oraculo
congelado con `node:test`, usando `openCartDb(":memory:")` y
`openOrdersDb(":memory:")` -- sin red.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/confirm_purchase.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/confirm_purchase.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
