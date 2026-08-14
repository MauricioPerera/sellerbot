---
type: 'Task Contract'
title: 'Tool del agente: check_order_status'
description: 'Wrapper AgentTool que consulta el estado actual de una orden por id, para que el agente confirme el resultado real de un pago sin inventarlo.'
tags: ['ccdd', 'agent', 'orders', 'tool']
language: typescript

task: agent_tool_check_order_status
intent: "Exponer el estado de una orden como tool del agente."
target: src/agent/tools/check_order_status.ts
signature: "function checkOrderStatusTool(ordersDb: OrdersDb): AgentTool"
test_command: "node --test src/agent/tools/check_order_status.test.ts"
budget:
  cyclomatic_max: 4
  nesting_max: 2
tests: "src/agent/tools/check_order_status.test.ts"
tests_sha256: "863cfb1b21e50932b2b863d071c51558b025b02c74a847006a9498a634210926"
touch_only: ['src/agent/tools/check_order_status.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente check_order_status

## Intent
Issue #4, criterio de aceptacion 6: "la UI/chat puede presentar el pay link
y despues consultar el estado actualizado de la orden" y comportamiento
esperado punto 6: "la conversacion/interfaz puede consultar y comunicar el
resultado real de esa simulacion, sin inventarlo". Despues de que el usuario
completa (o no) el pago en la pagina mock (batch anterior:
[web-render-pay-page](./web-render-pay-page.md)), el agente necesita una
forma de volver a preguntar "¿como quedo mi compra?" y obtener el estado
REAL persistido, no una suposicion.

## Interface
```typescript
function checkOrderStatusTool(ordersDb: OrdersDb): AgentTool
```

## Invariants
- `name` es siempre `"check_order_status"`; `parameters` exige `order_id:
  string` (`required`, `additionalProperties: false`).
- `execute({ order_id })` con `order_id` no-string devuelve
  `{ error: "order_id must be a string" }`, nunca lanza.
- Con un `order_id` que no existe (`ordersDb.getOrder` devuelve `null`)
  devuelve `{ error: "no order found with id <order_id>" }`.
- Con un `order_id` valido devuelve `{ order_id: order.id, status:
  order.status, total_cents: order.totalCents }` -- el `status` refleja
  SIEMPRE el valor actual persistido (`"pending_payment"`, `"paid"`,
  `"payment_failed"` o `"cancelled"`), nunca un valor cacheado o adivinado.
- No recibe `conversationId` por closure (a diferencia de las tools de
  carrito): un `order_id` es global, no esta atado a una conversacion
  especifica -- cualquier orden puede consultarse por su id.

## Examples
- Orden recien creada (`pending_payment`), `execute({ order_id: order.id })`
  -> `{ order_id: "...", status: "pending_payment", total_cents: 6900 }`.
- Despues de `ordersDb.setPaymentResult(order.id, "approved")`, la MISMA
  llamada -> `{ ..., status: "paid" }`.
- `execute({ order_id: "missing" })` -> `{ error: "no order found with id
  missing" }`.
- `execute({ order_id: 1 })` -> `{ error: "order_id must be a string" }`.

## Do / Don't
- DO: leer siempre el estado fresco via `ordersDb.getOrder` en cada
  `execute()` -- nunca cachear el resultado entre llamadas.
- DON'T: incluir `items` completos en la respuesta -- el modelo ya conoce el
  detalle de la compra por `confirm_purchase`; esta tool es solo para
  confirmar el ESTADO, mantenerla minima.

## Tests
(Los tests estan en `src/agent/tools/check_order_status.test.ts`, oraculo
congelado con `node:test`, usando `openOrdersDb(":memory:")` -- sin red.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/check_order_status.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/check_order_status.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
