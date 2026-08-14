---
type: 'Task Contract'
title: 'Tool del agente: add_to_cart'
description: 'Wrapper AgentTool que agrega un producto del catalogo al carrito de la conversacion, persistiendo via CartDb y devolviendo el resumen actualizado.'
tags: ['ccdd', 'agent', 'cart', 'tool']
language: typescript

task: agent_tool_add_to_cart
intent: "Exponer addCartItem como tool del agente, persistiendo el resultado."
target: src/agent/tools/add_to_cart.ts
signature: "function addToCartTool(cartDb: CartDb, catalog: DbProduct[], conversationId: string): AgentTool"
test_command: "node --test src/agent/tools/add_to_cart.test.ts"
budget:
  cyclomatic_max: 10
  nesting_max: 3
tests: "src/agent/tools/add_to_cart.test.ts"
tests_sha256: "32e6d9862a4980917b0acb3bca1e24d3da0d755e054a8df201754f56b0e78c64"
touch_only: ['src/agent/tools/add_to_cart.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente add_to_cart

## Intent
Issue #4 (comentario "carrito conversacional"): "el agente puede agregar ...
[items]" al carrito. Puente entre [cart-cart-add-item](./cart-cart-add-item.md)
(funcion pura) y [cart-cart-db](./cart-cart-db.md) (persistencia): resuelve
`product_id` contra el `catalog` ya cargado (mismo snapshot que usan
`search_products`/`get_product_detail`), arma el `CartItem` con nombre/precio
actuales, llama `addCartItem`, y persiste el resultado via `CartDb.saveCart`.
A diferencia de las tools de catalogo (`search_products`, `get_product_detail`),
esta tool tiene efecto secundario (escribe en SQLite) porque el carrito es
estado mutable de la conversacion.

## Interface
```typescript
function addToCartTool(cartDb: CartDb, catalog: DbProduct[], conversationId: string): AgentTool
```

## Invariants
- `name` es siempre `"add_to_cart"`; `parameters` acepta `product_id: string`
  (`required`) y `quantity: number` (opcional, default `1` si se omite).
- `execute({ product_id })` con `product_id` no-string devuelve
  `{ error: "product_id must be a string" }`, nunca lanza.
- `execute({ product_id, quantity })` con `quantity` presente y no entero
  positivo (`<= 0` o no entero) devuelve
  `{ error: "quantity must be a positive integer" }`.
- `execute({ product_id })` con un id que no existe en `catalog` devuelve
  `{ error: "no product found with id <product_id>" }`.
- Con un `product_id` valido: lee el carrito actual via
  `cartDb.getCart(conversationId)` (o un carrito vacio si no existe todavia),
  arma `{ productId: product.id, name: product.name, quantity, unitPriceCents:
  product.priceCents }`, aplica `addCartItem`, estampa un `updatedAt` nuevo
  (`new Date().toISOString()`), guarda el resultado con `cartDb.saveCart`, y
  devuelve `{ item: <item agregado tal cual quedo en el carrito>, cart:
  summarizeCart(<carrito guardado>) }`.
- Nunca lanza: cualquier caso invalido devuelve `{ error: string }`.
- Cada `conversationId` tiene su propio carrito independiente (delegado a
  `CartDb`, ya probado en su propio contrato).

## Examples
- `addToCartTool(db, catalog, "conv-1").execute({ product_id: "145", quantity:
  2 })` sobre un carrito vacio -> `{ item: {...quantity: 2}, cart: { items:
  [...], totalCents: ... } }`, y `db.getCart("conv-1")` refleja ese item.
- Llamar dos veces con el mismo `product_id` -> la segunda vez el item queda
  con la cantidad sumada (comportamiento de `addCartItem`).
- `execute({ product_id: "missing" })` -> `{ error: "no product found with id
  missing" }`.
- `execute({ product_id: "145", quantity: 0 })` -> `{ error: "quantity must be
  a positive integer" }`.

## Do / Don't
- DO: usar `catalog.find(p => p.id === product_id)` para resolver el producto
  (mismo patron que otras tools de catalogo).
- DO: llamar `cartDb.saveCart` SIEMPRE que la operacion sea exitosa (no dejar
  el cambio solo en memoria).
- DON'T: reimplementar la logica de merge de cantidades aca -- delegarla a
  `addCartItem` (`cart_add_item.ts`).
- DON'T: formatear moneda -- `summarizeCart` ya devuelve centavos, el
  formato ARS es responsabilidad de capas superiores (UI/prompt).

## Tests
(Los tests estan en `src/agent/tools/add_to_cart.test.ts`, oraculo congelado con
`node:test`, usando `openCartDb(":memory:")` y un catalogo fijo de 2 productos
en memoria -- sin red.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/add_to_cart.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/add_to_cart.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
