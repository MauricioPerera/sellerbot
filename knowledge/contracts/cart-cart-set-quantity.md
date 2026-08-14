---
type: 'Task Contract'
title: 'Fijar la cantidad absoluta de un item del carrito'
description: 'Funcion pura que fija la cantidad de un item existente a un valor absoluto; 0 lo elimina, productId inexistente lanza.'
tags: ['ccdd', 'cart']
language: typescript

task: cart_cart_set_quantity
intent: "Fijar la cantidad absoluta de un item existente del carrito."
target: src/agent/cart/cart_set_quantity.ts
signature: "function setCartItemQuantity(cart: Cart, productId: string, quantity: number): Cart"
test_command: "node --test src/agent/cart/cart_set_quantity.test.ts"
budget:
  cyclomatic_max: 8
  nesting_max: 3
tests: "src/agent/cart/cart_set_quantity.test.ts"
tests_sha256: "a390a0213974e1679d45c0706d2ecdda66812a28418939bd2359ca1168e2e017"
touch_only: ['src/agent/cart/cart_set_quantity.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Fijar cantidad de un item del carrito

## Intent
Issue #4: "el agente puede ... cambiar cantidad ..." de un item ya presente en el
carrito. A diferencia de `cart_add_item.ts` (que SUMA cantidad), esta funcion FIJA
un valor absoluto -- el caso de uso es "quiero 3 en vez de 2", no "agregame 3
mas". Funcion pura, hermana de `cart_add_item.ts`/`cart_remove_item.ts`.

## Interface
```typescript
import type { Cart } from "./cart_db.ts";
function setCartItemQuantity(cart: Cart, productId: string, quantity: number): Cart
```

## Invariants
- Si existe un item con ese `productId` y `quantity > 0`: el resultado tiene ese
  item con `quantity` reemplazada por el valor dado; `name`/`unitPriceCents` y el
  resto de los items quedan intactos.
- Si existe un item con ese `productId` y `quantity === 0`: el item se elimina
  del carrito por completo (equivalente a `removeCartItem`).
- Si NINGUN item del carrito tiene ese `productId`: lanza (a diferencia de
  `cart_remove_item.ts`, que en ese caso es no-op -- aca fijar la cantidad de
  algo que no esta en el carrito es un error del llamador).
- Lanza si `quantity` es negativa o no es un entero (`1.5`, `NaN`).
- `cart.conversationId` y `cart.updatedAt` se preservan sin cambios.
- NO muta el objeto `cart` recibido: devuelve un `Cart` nuevo.

## Examples
- Carrito con `{productId: "145", quantity: 2}`, `setCartItemQuantity(cart,
  "145", 5)` -> ese item queda con `quantity: 5`.
- `setCartItemQuantity(cart, "145", 0)` -> el item con `productId: "145"`
  desaparece de `items`.
- `setCartItemQuantity(cart, "999", 3)` con `"999"` ausente del carrito -> lanza.
- `setCartItemQuantity(cart, "145", -1)` -> lanza.

## Do / Don't
- DO: comparar por `productId` exacto (`===`).
- DO: reusar la misma logica de "eliminar" que `cart_remove_item.ts` para el
  caso `quantity === 0` (repetir la logica esta bien, son funciones
  independientes con su propio contrato).
- DON'T: sumar la cantidad -- este contrato FIJA un valor absoluto, no acumula
  (esa es la diferencia deliberada con `cart_add_item.ts`).
- DON'T: tocar SQLite ni `CartDb` desde aca.

## Tests
(Los tests estan en `src/agent/cart/cart_set_quantity.test.ts`, oraculo congelado
con `node:test`, con carritos fijos en memoria -- sin SQLite real.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/cart/cart_set_quantity.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/cart/cart_set_quantity.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
