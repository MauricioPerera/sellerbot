---
type: 'Task Contract'
title: 'Tool del agente: update_cart_quantity'
description: 'Wrapper AgentTool que fija la cantidad absoluta de un item del carrito de la conversacion, persistiendo via CartDb.'
tags: ['ccdd', 'agent', 'cart', 'tool']
language: typescript

task: agent_tool_update_cart_quantity
intent: "Exponer setCartItemQuantity como tool del agente, persistiendo el resultado."
target: src/agent/tools/update_cart_quantity.ts
signature: "function updateCartQuantityTool(cartDb: CartDb, conversationId: string): AgentTool"
test_command: "node --test src/agent/tools/update_cart_quantity.test.ts"
budget:
  cyclomatic_max: 8
  nesting_max: 3
tests: "src/agent/tools/update_cart_quantity.test.ts"
tests_sha256: "e9144d698b14b4a1ccfcb6f23626c0f0df63d707da46789108c5492f7c73b4e4"
touch_only: ['src/agent/tools/update_cart_quantity.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente update_cart_quantity

## Intent
Issue #4: "el agente puede ... cambiar cantidad ..." de un item ya presente en
el carrito ("quiero 3 en vez de 2", no "agregame 3 mas" -- ese es
`add_to_cart`). Puente entre [cart-cart-set-quantity](./cart-cart-set-quantity.md)
(funcion pura, que LANZA si el `productId` no esta en el carrito) y
[cart-cart-db](./cart-cart-db.md). Esta tool debe convertir ese `throw` en un
`{ error }` estructurado, mismo patron never-throw que el resto de las tools
(`tools/calculate.ts`).

## Interface
```typescript
function updateCartQuantityTool(cartDb: CartDb, conversationId: string): AgentTool
```

## Invariants
- `name` es siempre `"update_cart_quantity"`; `parameters` exige `product_id:
  string` y `quantity: number` (ambos `required`, `additionalProperties:
  false`).
- `execute({ product_id })` con `product_id` no-string devuelve
  `{ error: "product_id must be a string" }`.
- `execute({ product_id, quantity })` con `quantity` negativa o no entera
  devuelve `{ error: "quantity must be a non-negative integer" }` (a
  diferencia de `add_to_cart`, aca `0` es valido -- significa quitar el item).
- Con argumentos validos: lee el carrito via `cartDb.getCart(conversationId)`
  (vacio si no existe), llama `setCartItemQuantity`. Si esa llamada LANZA
  (porque el `product_id` no esta en el carrito), la tool atrapa la excepcion
  y devuelve `{ error: "product_id not in cart: <product_id>" }` -- nunca deja
  propagar la excepcion.
- Si la operacion es exitosa: estampa un `updatedAt` nuevo
  (`new Date().toISOString()`), guarda con `cartDb.saveCart`, y devuelve
  `{ cart: summarizeCart(<carrito guardado>) }`.

## Examples
- Carrito con `{productId: "145", quantity: 2}`, `execute({ product_id: "145",
  quantity: 5 })` -> `cart.items[0].quantity === 5`.
- `execute({ product_id: "145", quantity: 0 })` -> el item desaparece de
  `cart.items` (delegado a `setCartItemQuantity`).
- `execute({ product_id: "999", quantity: 3 })` con `"999"` ausente del
  carrito -> `{ error: "product_id not in cart: 999" }` (NO lanza).
- `execute({ product_id: "145", quantity: -1 })` -> `{ error: "quantity must
  be a non-negative integer" }`.

## Do / Don't
- DO: envolver la llamada a `setCartItemQuantity` en try/catch -- es la unica
  funcion pura del carrito que lanza en un caso de uso normal (productId
  ausente), y esta tool es la responsable de convertir eso en `{ error }`.
- DON'T: sumar la cantidad -- esta tool FIJA un valor absoluto (delegado a
  `setCartItemQuantity`), no acumula como `add_to_cart`.

## Tests
(Los tests estan en `src/agent/tools/update_cart_quantity.test.ts`, oraculo
congelado con `node:test`, usando `openCartDb(":memory:")` -- sin red.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/update_cart_quantity.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/update_cart_quantity.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
