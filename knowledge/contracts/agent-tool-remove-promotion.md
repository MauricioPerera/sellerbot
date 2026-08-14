---
type: 'Task Contract'
title: 'Tool del agente: remove_promotion'
description: 'Wrapper AgentTool que quita la promocion vinculada aplicada al carrito de la conversacion, sin tocar los items (idempotente).'
tags: ['ccdd', 'agent', 'promotions', 'cart', 'tool']
language: typescript

task: agent_tool_remove_promotion
intent: "Quitar la promocion vinculada aplicada al carrito, sin tocar items."
target: src/agent/tools/remove_promotion.ts
signature: "function removePromotionTool(cartDb: CartDb, conversationId: string): AgentTool"
test_command: "node --test src/agent/tools/remove_promotion.test.ts"
budget:
  cyclomatic_max: 6
  nesting_max: 3
tests: "src/agent/tools/remove_promotion.test.ts"
tests_sha256: "562da4e7a68c836dca150456d769c85b9e32c77fdfea98e210efd7c2155e7093"
touch_only: ['src/agent/tools/remove_promotion.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente remove_promotion

## Intent
Contraparte de [agent-tool-apply-promotion](./agent-tool-apply-promotion.md):
si el usuario quiere quitar el descuento por promocion, esta tool limpia el
slot `promotionId` del carrito. Mismo espiritu EXACTO que
`remove_coupon.ts` (issue #6): idempotente, nunca falla, y a proposito NO
toca `items` -- quitar la promocion detiene el DESCUENTO, pero el producto
que se agrego (si fue por `apply_promotion`) sigue siendo un item normal
del carrito; el usuario decide aparte si tambien quiere sacarlo
(`remove_from_cart`).

## Interface
```typescript
function removePromotionTool(cartDb: CartDb, conversationId: string): AgentTool
```

## Invariants
- `name` es siempre `"remove_promotion"`; `parameters` no exige ningun
  argumento (`required: []`, `additionalProperties: false`).
- `execute({})` llama `cartDb.setPromotionId(conversationId, null)`
  incondicionalmente (funciona igual con o sin carrito previo, con o sin
  promocion previamente aplicada -- `setPromotionId(id, null)` ya es
  idempotente por contrato de `cart_cart_db`).
- NO llama `cartDb.setCouponCode` ni toca `items`/`updatedAt` del carrito.
- Si no existe carrito para `conversationId`, devuelve `{ items: [],
  total_cents: 0 }`. Si existe, devuelve `{ items: summary.items,
  total_cents: summary.totalCents }` (mismo shape de salida que
  `remove_coupon.ts`, snake_case).
- Nunca lanza.

## Examples
- Carrito con promocion aplicada -> `execute({})` -> `cartDb.getPromotionId`
  pasa a ser `null`; los `items` del carrito quedan intactos.
- Carrito con cupon Y promocion aplicados -> tras `remove_promotion`, el
  cupon sigue aplicado (`getCouponCode` sin cambios).
- Sin carrito para la conversacion -> `{ items: [], total_cents: 0 }`, no
  lanza.
- Carrito sin promocion aplicada -> no lanza, sigue devolviendo el resumen
  del carrito tal cual.

## Do / Don't
- DO: usar `summarizeCart` para armar la respuesta, igual que
  `remove_coupon.ts`.
- DON'T: remover items del carrito -- eso es responsabilidad explicita de
  `remove_from_cart`, nunca implicita al quitar una promocion.
- DON'T: tocar `couponCode` -- son slots independientes.

## Tests
(Los tests estan en `src/agent/tools/remove_promotion.test.ts`, oraculo
congelado con `node:test`, usando `openCartDb(":memory:")` -- sin red.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/remove_promotion.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/remove_promotion.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
