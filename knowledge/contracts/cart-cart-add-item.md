---
type: 'Task Contract'
title: 'Agregar (o sumar cantidad de) un item al carrito'
description: 'Funcion pura que agrega un item nuevo o suma su cantidad a un item existente del mismo productId, refrescando nombre/precio al ultimo snapshot.'
tags: ['ccdd', 'cart']
language: typescript

task: cart_cart_add_item
intent: "Agregar un item al carrito, sumando cantidad si el productId ya existe."
target: src/agent/cart/cart_add_item.ts
signature: "function addCartItem(cart: Cart, item: CartItem): Cart"
test_command: "node --test src/agent/cart/cart_add_item.test.ts"
budget:
  cyclomatic_max: 8
  nesting_max: 3
tests: "src/agent/cart/cart_add_item.test.ts"
tests_sha256: "eeaf120d81bcc84bab7f2d734d8226073658c26bdb448cabe5b53e4be1cb596e"
touch_only: ['src/agent/cart/cart_add_item.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Agregar item al carrito

## Intent
Issue #4: "el agente puede agregar ... [items]" y "si el mismo producto/variacion
se agrega nuevamente, se ajusta su cantidad". Esta funcion pura implementa esa
regla sobre un `Cart` ya cargado en memoria (el tool wrapper que la use es
responsable de leer el carrito via `CartDb.getCart`, llamar esta funcion, y
persistir el resultado via `CartDb.saveCart`). Mismo espiritu que
`search_products.ts`/`get_product_detail.ts`: pura, sin I/O, testeable sin SQLite.

## Interface
```typescript
import type { Cart, CartItem } from "./cart_db.ts";
function addCartItem(cart: Cart, item: CartItem): Cart
```

## Invariants
- Si NINGUN item del carrito tiene el mismo `productId` que `item`, se agrega
  `item` tal cual al final de `items`.
- Si YA existe un item con el mismo `productId`, el resultado tiene un unico item
  para ese `productId` con: `quantity` = suma de ambas cantidades; `name` y
  `unitPriceCents` = los valores del `item` recien pasado (el snapshot mas
  reciente reemplaza al anterior, la cantidad se acumula).
- El resto de los items del carrito (`productId` distinto) queda intacto, en el
  mismo orden relativo.
- `cart.conversationId` y `cart.updatedAt` se preservan sin cambios en el
  resultado -- esta funcion no estampa timestamps (lo hace quien llama, antes de
  `saveCart`).
- NO muta el objeto `cart` ni `item` recibidos: devuelve un `Cart` nuevo.
- Lanza si `item.quantity` no es un entero positivo (`> 0`) -- incluye `0`,
  negativos y no-enteros (`1.5`).

## Examples
- Carrito vacio + item nuevo -> carrito con ese unico item.
- Carrito con `{productId: "145", quantity: 2}` + agregar
  `{productId: "145", quantity: 3}` -> queda un solo item `{productId: "145",
  quantity: 5}` con el nombre/precio del segundo `item`.
- Carrito con dos items distintos, agregar cantidad al primero -> el segundo
  queda exactamente igual.
- `addCartItem(cart, {..., quantity: 0})` -> lanza.

## Do / Don't
- DO: tratar `item.productId` como la clave de igualdad (no comparar `name` ni
  `unitPriceCents` para decidir si es el "mismo" item).
- DO: devolver un array/objeto nuevo (spread), nunca mutar `cart.items` in place.
- DON'T: tocar SQLite ni `CartDb` desde aca -- funcion pura sobre datos en
  memoria.
- DON'T: intentar resolver aca a que producto del catalogo corresponde
  `item.productId` -- ese lookup ya se hizo antes de construir el `CartItem`.

## Tests
(Los tests estan en `src/agent/cart/cart_add_item.test.ts`, oraculo congelado con
`node:test`, con carritos fijos en memoria -- sin SQLite real.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/cart/cart_add_item.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/cart/cart_add_item.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
