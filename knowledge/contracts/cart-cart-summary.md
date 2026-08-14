---
type: 'Task Contract'
title: 'Resumen del carrito: subtotal por item y total'
description: 'Funcion pura que calcula el subtotal de cada item (precio x cantidad) y el total del carrito, en centavos.'
tags: ['ccdd', 'cart']
language: typescript

task: cart_cart_summary
intent: "Calcular los totales del carrito en centavos."
target: src/agent/cart/cart_summary.ts
signature: "function summarizeCart(cart: Cart): CartSummary"
test_command: "node --test src/agent/cart/cart_summary.test.ts"
budget:
  cyclomatic_max: 6
  nesting_max: 3
tests: "src/agent/cart/cart_summary.test.ts"
tests_sha256: "2ea799bc84388829fff9a77ddf26bc11885da9d64585315fe0c28381c502c586"
touch_only: ['src/agent/cart/cart_summary.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Resumen del carrito

## Intent
Issue #4: "cuando el usuario pregunte '¿que tengo en el carrito?', el agente
muestra un resumen claro con items, cantidades, subtotal [por item]" y el
comentario de aclaracion agrega "el resumen muestra subtotal por item y total del
carrito". Esta funcion pura calcula esos numeros en centavos (moneda ARS, mismo
patron entero-sin-float que `catalog_db.ts`/`normalize_product_row.ts`) para que
el tool `view_cart` (batch siguiente) solo tenga que formatear el resultado.

## Interface
```typescript
import type { Cart, CartItem } from "./cart_db.ts";
export interface CartItemSummary extends CartItem {
  subtotalCents: number | null;
}
export interface CartSummary {
  items: CartItemSummary[];
  totalCents: number | null;
}
function summarizeCart(cart: Cart): CartSummary
```

## Invariants
- Para cada item del carrito, `subtotalCents = unitPriceCents * quantity` si
  `unitPriceCents` no es `null`; si `unitPriceCents` es `null`, `subtotalCents`
  es `null` (no se asume precio 0).
- El orden de `items` en el resultado es el mismo que en `cart.items`.
- `totalCents` es la suma de todos los `subtotalCents` SOLO si NINGUN item tiene
  `subtotalCents: null`; si al menos un item no tiene precio, `totalCents` es
  `null` (no se puede calcular un total confiable con datos faltantes).
- Un carrito con `items: []` devuelve `{ items: [], totalCents: 0 }` (el total de
  nada es cero, no `null` -- no hay ningun item con precio faltante).
- NO muta el `cart` recibido; nunca lanza.

## Examples
- Carrito vacio -> `{ items: [], totalCents: 0 }`.
- Dos items con precio (`6900` x2 y `5500` x1) -> subtotales `13800` y `5500`,
  `totalCents: 19300`.
- Un item con `unitPriceCents: null` -> ese item tiene `subtotalCents: null` y
  `totalCents` del carrito completo es `null`, aunque otros items si tengan
  precio.

## Do / Don't
- DO: usar aritmetica entera (centavos), nunca floats/decimales para el calculo
  de subtotal/total.
- DO: devolver objetos nuevos (spread de cada `CartItem` + `subtotalCents`), no
  mutar `cart.items`.
- DON'T: formatear moneda aca (`$ 1.234,56`) -- esta funcion devuelve numeros en
  centavos; el formato ARS es responsabilidad de quien consume el resultado
  (tool wrapper / UI).
- DON'T: tocar SQLite ni `CartDb` desde aca.

## Tests
(Los tests estan en `src/agent/cart/cart_summary.test.ts`, oraculo congelado con
`node:test`, con carritos fijos en memoria -- sin SQLite real.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/cart/cart_summary.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/cart/cart_summary.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
