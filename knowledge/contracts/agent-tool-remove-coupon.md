---
type: 'Task Contract'
title: 'Tool del agente: remove_coupon'
description: 'Wrapper AgentTool que quita el cupon aplicado al carrito de la conversacion, idempotente.'
tags: ['ccdd', 'agent', 'coupons', 'cart', 'tool']
language: typescript

task: agent_tool_remove_coupon
intent: "Quitar el cupon aplicado al carrito."
target: src/agent/tools/remove_coupon.ts
signature: "function removeCouponTool(cartDb: CartDb, conversationId: string): AgentTool"
test_command: "node --test src/agent/tools/remove_coupon.test.ts"
budget:
  cyclomatic_max: 4
  nesting_max: 2
tests: "src/agent/tools/remove_coupon.test.ts"
tests_sha256: "3de6359972f99ab8fa370a7aec4da0f1e2f6e74d2c06937a427426ab4648fd5f"
touch_only: ['src/agent/tools/remove_coupon.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente remove_coupon

## Intent
Issue #6 batch 2: contraparte de [agent-tool-apply-coupon](./agent-tool-apply-coupon.md)
-- el usuario puede querer quitar un cupon ya aplicado (por ejemplo, para
probar uno distinto). Hermana de
[agent-tool-remove-from-cart](./agent-tool-remove-from-cart.md): idempotente,
nunca falla por ausencia de estado previo.

## Interface
```typescript
function removeCouponTool(cartDb: CartDb, conversationId: string): AgentTool
```

## Invariants
- `name` es siempre `"remove_coupon"`; `parameters` no exige ningun
  argumento (`required: []`, `additionalProperties: false`).
- `execute({})` llama `cartDb.setCouponCode(conversationId, null)`
  (idempotente por diseno de `cart_db.ts` -- no lanza aunque no haya
  carrito ni cupon previo).
- Devuelve el total del carrito SIN descuento: `{ items: <de
  summarizeCart>, totalCents: <de summarizeCart> }` -- mismo shape que
  `view_cart` sin cupon aplicado (reusa `summarizeCart` sobre el carrito
  actual, o el carrito vacio si no existe).
- Nunca lanza.

## Examples
- Carrito con cupon `"WELCOME10"` aplicado, `execute({})` -> el cupon se
  quita (`cartDb.getCouponCode` pasa a `null`), devuelve el total sin
  descontar.
- Conversacion sin carrito -> `execute({})` -> `{ items: [], totalCents: 0
  }`, sin error.
- Carrito sin ningun cupon aplicado -> `execute({})` -> no-op, mismo total
  que antes.

## Do / Don't
- DO: reusar `summarizeCart` (`cart/cart_summary.ts`) para el total -- no
  reimplementar el calculo.
- DON'T: fallar si no hay cupon que quitar -- es una operacion siempre
  segura de invocar.

## Tests
(Los tests estan en `src/agent/tools/remove_coupon.test.ts`, oraculo
congelado con `node:test`, usando `openCartDb(":memory:")` -- sin red.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/remove_coupon.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/remove_coupon.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
