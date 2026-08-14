---
type: 'Task Contract'
title: 'Almacen SQLite del carrito (upsert por conversationId)'
description: 'Persiste el carrito completo (items, cantidades, snapshot de precio) por conversationId, via node:sqlite, sobreviviendo un reinicio del proceso.'
tags: ['ccdd', 'cart', 'sqlite']
language: typescript

task: cart_cart_db
intent: "Persistir el carrito de una conversacion via node:sqlite."
target: src/agent/cart/cart_db.ts
signature: "function openCartDb(location: string): CartDb"
test_command: "node --test src/agent/cart/cart_db.test.ts"
budget:
  cyclomatic_max: 6
  nesting_max: 2
tests: "src/agent/cart/cart_db.test.ts"
tests_sha256: "63f251b8d18175339019a5c4712ff6546ee31939f81924e7d01ca721a68b93d3"
touch_only: ['src/agent/cart/cart_db.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Almacen SQLite del carrito

## Intent
Issue #4 (comentario "carrito conversacional antes de crear la orden"): antes de
generar una orden, el agente maneja un carrito por conversacion. Esta es la capa de
persistencia minima -- guarda, por `conversationId`, la lista completa de items
(producto/variacion, cantidad, snapshot de nombre y precio). Mismo patron que
[conversation-conversation-db](./conversation-conversation-db.md): `node:sqlite`
nativo, cero deps, `saveCart` es UPSERT (sobrescribe el carrito completo), no falla
en duplicado -- un carrito se actualiza en cada turno.

## Interface
```typescript
export interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number | null;
}
export interface Cart {
  conversationId: string;
  items: CartItem[];
  updatedAt: string;
}
export interface CartDb {
  getCart(conversationId: string): Cart | null;
  saveCart(cart: Cart): void;
  close(): void;
}
function openCartDb(location: string): CartDb
```

## Invariants
- `openCartDb(location)` crea la tabla si no existe; abrir el mismo archivo dos
  veces nunca lanza ni borra datos previos.
- `location` acepta `:memory:` y una ruta de archivo real.
- `getCart(id)` con un `conversationId` sin guardar previamente devuelve `null`
  (nunca lanza).
- `saveCart(cart)` es un UPSERT por `conversationId`: si ya existia un carrito para
  ese id, el nuevo `saveCart` REEMPLAZA el registro completo (`items` incluido, no
  hace merge parcial de items -- eso lo hacen las funciones puras de
  `cart_add_item.ts`/`cart_remove_item.ts`/`cart_set_quantity.ts` antes de llamar a
  `saveCart` con el resultado).
- `items` (array) se serializa/deserializa como JSON en una columna `TEXT`, igual
  que `lastSearchResultIds` en `conversation_db.ts`. `unitPriceCents: null` dentro
  de un item se preserva en el round-trip (producto sin precio cargado).
- `saveCart` con un `conversationId` no afecta el carrito de conversaciones
  distintas.
- `close()` libera el handle; no se usa el `CartDb` despues.

## Examples
- `getCart("conv-1")` sobre una base vacia -> `null`.
- `saveCart({...})` + `getCart` con el mismo id -> el mismo objeto guardado.
- `saveCart` dos veces con el mismo `conversationId` -> `getCart` devuelve la
  segunda version completa (la primera se sobrescribe, incluidos los items).
- Un item con `unitPriceCents: null` sobrevive el round-trip tal cual.
- Guardar, cerrar, reabrir el mismo archivo -> el carrito sigue ahi (simula un
  reinicio del proceso).

## Do / Don't
- DO: usar `node:sqlite` (`DatabaseSync`) del core de Node, sin dependencia npm.
- DO: serializar `items` como columna `TEXT` con `JSON.stringify`/`JSON.parse`.
- DON'T: implementar aca la logica de agregar/quitar/ajustar cantidad -- eso vive
  en `cart_add_item.ts`, `cart_remove_item.ts` y `cart_set_quantity.ts` (funciones
  puras separadas); este contrato solo persiste/recupera el `Cart` completo.

## Tests
(Los tests estan en `src/agent/cart/cart_db.test.ts`, oraculo congelado con
`node:test`, usando `:memory:` para los casos deterministas y un archivo temporal
real para el caso de reinicio.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/cart/cart_db.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/cart/cart_db.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
