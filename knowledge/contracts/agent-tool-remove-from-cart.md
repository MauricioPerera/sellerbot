---
type: 'Task Contract'
title: 'Tool del agente: remove_from_cart'
description: 'Wrapper AgentTool que quita un item del carrito de la conversacion por productId, persistiendo via CartDb.'
tags: ['ccdd', 'agent', 'cart', 'tool']
language: typescript

task: agent_tool_remove_from_cart
intent: "Exponer removeCartItem como tool del agente, persistiendo el resultado."
target: src/agent/tools/remove_from_cart.ts
signature: "function removeFromCartTool(cartDb: CartDb, conversationId: string): AgentTool"
test_command: "node --test src/agent/tools/remove_from_cart.test.ts"
budget:
  cyclomatic_max: 6
  nesting_max: 2
tests: "src/agent/tools/remove_from_cart.test.ts"
tests_sha256: "f23d87caf05b93b56c15c978bd085e8c5121851dc64bab3c35aaa9b93892d70b"
touch_only: ['src/agent/tools/remove_from_cart.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente remove_from_cart

## Intent
Issue #4: "el agente puede ... quitar ... [items]" del carrito. Puente entre
[cart-cart-remove-item](./cart-cart-remove-item.md) (funcion pura) y
[cart-cart-db](./cart-cart-db.md) (persistencia), hermana de
[agent-tool-add-to-cart](./agent-tool-add-to-cart.md).

## Interface
```typescript
function removeFromCartTool(cartDb: CartDb, conversationId: string): AgentTool
```

## Invariants
- `name` es siempre `"remove_from_cart"`; `parameters` exige `product_id:
  string` (`required`, `additionalProperties: false`).
- `execute({ product_id })` con `product_id` no-string devuelve
  `{ error: "product_id must be a string" }`, nunca lanza.
- Con un `product_id` valido: lee el carrito actual via
  `cartDb.getCart(conversationId)` (o un carrito vacio si no existe todavia),
  aplica `removeCartItem`, estampa un `updatedAt` nuevo
  (`new Date().toISOString()`), guarda con `cartDb.saveCart`, y devuelve
  `{ cart: summarizeCart(<carrito guardado>) }`.
- Si el `product_id` no estaba en el carrito, es no-op (mismo comportamiento
  que `removeCartItem`): devuelve el carrito sin cambios, NO es un error.
- Sobre un carrito inexistente (`cartDb.getCart` devuelve `null`), se comporta
  como si el carrito estuviera vacio -- devuelve `{ cart: { items: [],
  totalCents: 0 } }` sin lanzar ni guardar un carrito nuevo innecesariamente.

## Examples
- Carrito con dos items, `execute({ product_id: "145" })` -> `cart.items`
  queda con el otro item; `cartDb.getCart` refleja el cambio.
- `execute({ product_id: "999" })` sobre un carrito que no tiene ese id -> el
  mismo carrito, sin error.
- `execute({ product_id: 145 })` (numero) -> `{ error: "product_id must be a
  string" }`.

## Do / Don't
- DO: delegar la logica de eliminacion a `removeCartItem`
  (`cart_remove_item.ts`), no reimplementarla.
- DON'T: lanzar cuando el `product_id` no esta en el carrito -- coherente con
  que `removeCartItem` es idempotente por diseno.

## Tests
(Los tests estan en `src/agent/tools/remove_from_cart.test.ts`, oraculo
congelado con `node:test`, usando `openCartDb(":memory:")` -- sin red.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/remove_from_cart.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/remove_from_cart.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
