---
type: 'Task Contract'
title: 'Quitar un item del carrito por productId'
description: 'Funcion pura que elimina el item con el productId dado; no-op si no existe.'
tags: ['ccdd', 'cart']
language: typescript

task: cart_cart_remove_item
intent: "Quitar del carrito el item con el productId dado."
target: src/agent/cart/cart_remove_item.ts
signature: "function removeCartItem(cart: Cart, productId: string): Cart"
test_command: "node --test src/agent/cart/cart_remove_item.test.ts"
budget:
  cyclomatic_max: 4
  nesting_max: 2
tests: "src/agent/cart/cart_remove_item.test.ts"
tests_sha256: "dc7ada7317df1a59806223e1d6697995ffc54d59ad6fa863f1632800fc9c9778"
touch_only: ['src/agent/cart/cart_remove_item.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Quitar item del carrito

## Intent
Issue #4: "el agente puede ... quitar ... [items]" del carrito. Funcion pura,
hermana de `cart_add_item.ts` y `cart_set_quantity.ts` -- opera sobre un `Cart` en
memoria, quien la llama se encarga de leer/guardar via `CartDb`.

## Interface
```typescript
import type { Cart } from "./cart_db.ts";
function removeCartItem(cart: Cart, productId: string): Cart
```

## Invariants
- Devuelve un `Cart` cuyos `items` son los del carrito original SIN el (o los,
  nunca deberia haber mas de uno) item cuyo `productId` coincide con el
  argumento.
- Si ningun item del carrito tiene ese `productId`, devuelve un `Cart`
  equivalente al original (no-op, NO lanza).
- `cart.conversationId` y `cart.updatedAt` se preservan sin cambios.
- NO muta el objeto `cart` recibido: devuelve un `Cart` nuevo.
- Sobre un carrito con `items: []`, devuelve un carrito con `items: []`.

## Examples
- Carrito con dos items, quitar uno -> queda el otro, mismo orden.
- Carrito con un item, quitar ese `productId` -> `items: []`.
- Quitar un `productId` que no esta en el carrito -> mismos items que antes, sin
  error.

## Do / Don't
- DO: comparar por `productId` exacto (`===`).
- DO: devolver un array nuevo (filter/spread), nunca mutar `cart.items` in
  place.
- DON'T: lanzar cuando el `productId` no existe -- es una operacion idempotente
  a proposito (a diferencia de `cart_set_quantity.ts`, que si lanza en ese caso).
- DON'T: tocar SQLite ni `CartDb` desde aca.

## Tests
(Los tests estan en `src/agent/cart/cart_remove_item.test.ts`, oraculo congelado
con `node:test`, con carritos fijos en memoria -- sin SQLite real.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/cart/cart_remove_item.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/cart/cart_remove_item.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
