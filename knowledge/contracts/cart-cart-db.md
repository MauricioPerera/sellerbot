---
type: 'Task Contract'
title: 'Almacen SQLite del carrito (upsert por conversationId)'
description: 'Persiste el carrito completo (items, cantidades, snapshot de precio) y el codigo de cupon aplicado por conversationId, via node:sqlite, sobreviviendo un reinicio del proceso.'
tags: ['ccdd', 'cart', 'sqlite', 'coupons']
language: typescript

task: cart_cart_db
intent: "Persistir el carrito de una conversacion via node:sqlite."
target: src/agent/cart/cart_db.ts
signature: "function openCartDb(location: string): CartDb"
test_command: "node --test src/agent/cart/cart_db.test.ts"
budget:
  cyclomatic_max: 14
  nesting_max: 3
tests: "src/agent/cart/cart_db.test.ts"
tests_sha256: "1137278dd79f157aac75a20af817f31ed800f3f43f78bd55ae68c058913baefd"
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

Issue #6 (batch 2, integracion de cupones al carrito) agrega
`getCouponCode`/`setCouponCode`: el codigo de cupon aplicado se guarda como
estado AUXILIAR de la conversacion, separado del `Cart` (`Cart` NO gana un
campo `couponCode` -- deliberado, para no tener que amendar
`cart_add_item.ts`/`cart_remove_item.ts`/`cart_set_quantity.ts`, que
construyen su `Cart` de retorno listando los campos explicitamente y no lo
preservarian). La validacion de SI un cupon es aplicable
([coupons-evaluate-coupon](./coupons-evaluate-coupon.md)) es responsabilidad
de la tool que llama a `setCouponCode`, no de este contrato -- aca solo se
persiste el codigo ya validado.

Issue #9 (batch B, promociones vinculadas) agrega `getPromotionId`/
`setPromotionId` con el MISMO patron exacto que el cupon (columna nullable
aparte, no dentro de `Cart`, no se toca en `saveCart`): el `id` de la
`Promotion` ([promotions-promotions-db](./promotions-promotions-db.md))
activa en esta conversacion. Cupon y promocion son slots INDEPENDIENTES --
pueden coexistir en el mismo carrito (decision del usuario: "ambos, y si
contradicen que gane el cupon" implica que ambos tipos de descuento pueden
estar activos a la vez; la resolucion de como interactuan vive en la tool
que combina ambas evaluaciones, no aca).

IMPORTANTE (encontrado al probar en real contra un `data/cart.sqlite`
preexistente de antes de este batch): `CREATE TABLE IF NOT EXISTS` NO
agrega columnas a una tabla que YA existe con un schema mas viejo -- abrir
un archivo real creado con la version anterior de este contrato (con
`couponCode` pero sin `promotionId`) debe MIGRAR la tabla (`ALTER TABLE
carts ADD COLUMN promotionId TEXT`) en vez de romper con "table carts has
no column named promotionId". Mismo patron que la migracion de
`order_events` en `orders_db.ts` (`PRAGMA table_info` + `ALTER TABLE ADD
COLUMN` por cada columna faltante).

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
  getCouponCode(conversationId: string): string | null;
  setCouponCode(conversationId: string, code: string | null): void;
  getPromotionId(conversationId: string): string | null;
  setPromotionId(conversationId: string, id: string | null): void;
  close(): void;
}
function openCartDb(location: string): CartDb
```

## Invariants
- `openCartDb(location)` crea la tabla si no existe; abrir el mismo archivo dos
  veces nunca lanza ni borra datos previos.
- Si la tabla `carts` YA existe pero le falta la columna `couponCode` y/o
  `promotionId` (archivo creado con una version anterior del schema),
  `openCartDb` la migra agregando las columnas faltantes (`ALTER TABLE
  carts ADD COLUMN <col> TEXT`) ANTES de preparar cualquier statement --
  nunca lanza "no such column" al abrir un archivo real preexistente.
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
- `getCouponCode(conversationId)`: `null` si no existe un carrito para ese id, o
  si existe pero no tiene cupon aplicado. Nunca lanza.
- `setCouponCode(conversationId, code)`:
  - `code` es un string no nulo (aplicar un cupon): LANZA si no existe un
    carrito para ese `conversationId` -- no se puede aplicar un cupon a un
    carrito que no existe.
  - `code: null` (quitar el cupon aplicado): NO lanza aunque no exista un
    carrito para ese id -- operacion idempotente, mismo espiritu que
    `removeCartItem` en `cart_remove_item.ts`.
  - En cualquier caso exitoso, `setCouponCode` NO modifica `items` ni
    `updatedAt` del carrito -- solo el campo de cupon.
- `saveCart` con un carrito nuevo NO borra un cupon previamente aplicado a
  ese `conversationId` a menos que el propio `saveCart` lo pise
  explicitamente (en la practica, las tools de carrito no tocan el campo de
  cupon al llamar `saveCart`, asi que sobrevive las operaciones de
  agregar/quitar/ajustar cantidad de items).
- `getPromotionId(conversationId)`: `null` si no existe un carrito para ese
  id, o si existe pero no tiene promocion aplicada. Nunca lanza.
- `setPromotionId(conversationId, id)`:
  - `id` es un string no nulo (aplicar una promocion): LANZA si no existe un
    carrito para ese `conversationId`.
  - `id: null` (quitar la promocion aplicada): NO lanza aunque no exista un
    carrito para ese id -- operacion idempotente, mismo criterio que
    `setCouponCode(conversationId, null)`.
  - En cualquier caso exitoso, `setPromotionId` NO modifica `items`,
    `updatedAt`, ni el `couponCode` del carrito -- solo el campo de
    promocion. Simetricamente, `setCouponCode` no modifica el campo de
    promocion.
  - `saveCart` NO borra una promocion previamente aplicada (mismo criterio
    que con el cupon).
- `close()` libera el handle; no se usa el `CartDb` despues.

## Examples
- `getCart("conv-1")` sobre una base vacia -> `null`.
- `saveCart({...})` + `getCart` con el mismo id -> el mismo objeto guardado.
- `saveCart` dos veces con el mismo `conversationId` -> `getCart` devuelve la
  segunda version completa (la primera se sobrescribe, incluidos los items).
- Un item con `unitPriceCents: null` sobrevive el round-trip tal cual.
- Guardar, cerrar, reabrir el mismo archivo -> el carrito sigue ahi (simula un
  reinicio del proceso).
- `saveCart(cart)` + `setCouponCode("conv-1", "WELCOME10")` + `getCouponCode("conv-1")`
  -> `"WELCOME10"`.
- `setCouponCode("conv-1", "WELCOME10")` SIN carrito previo -> lanza.
- `setCouponCode("conv-1", null)` SIN carrito previo -> no lanza,
  `getCouponCode` sigue devolviendo `null`.
- `saveCart(cart)` + `setCouponCode("conv-1", "WELCOME10")` +
  `setPromotionId("conv-1", "promo-1")` -> `getCouponCode` devuelve
  `"WELCOME10"` Y `getPromotionId` devuelve `"promo-1"` (coexisten).
- `setPromotionId("conv-1", "promo-1")` SIN carrito previo -> lanza.
- `setPromotionId("conv-1", null)` SIN carrito previo -> no lanza,
  `getPromotionId` sigue devolviendo `null`.
- Un archivo con una tabla `carts` que tiene `couponCode` pero NO
  `promotionId` (creado antes de este batch) -> `openCartDb(file)` no
  lanza, migra la columna, y `getPromotionId` sobre una fila existente
  devuelve `null` (no tenia promocion aplicada, columna recien agregada).

## Do / Don't
- DO: usar `node:sqlite` (`DatabaseSync`) del core de Node, sin dependencia npm.
- DO: serializar `items` como columna `TEXT` con `JSON.stringify`/`JSON.parse`.
- DO: guardar el codigo de cupon en su propia columna nullable de la misma
  tabla `carts` (o una tabla auxiliar si preferis, mientras el comportamiento
  de arriba se cumpla) -- no dentro del JSON de `items`.
- DO: guardar el `id` de promocion en OTRA columna nullable propia,
  independiente de la del cupon (mismo criterio, no dentro del JSON de
  `items`).
- DON'T: implementar aca la logica de agregar/quitar/ajustar cantidad -- eso vive
  en `cart_add_item.ts`, `cart_remove_item.ts` y `cart_set_quantity.ts` (funciones
  puras separadas); este contrato solo persiste/recupera el `Cart` completo.
- DON'T: validar aca si un cupon es elegible/valido -- eso es
  `evaluate_coupon.ts`; este contrato solo persiste el codigo ya decidido
  por la tool que lo llama.
- DON'T: validar aca si una promocion es elegible/valida -- eso es
  `evaluate_promotion.ts`; este contrato solo persiste el `id` ya decidido
  por la tool que lo llama.

## Tests
(Los tests estan en `src/agent/cart/cart_db.test.ts`, oraculo congelado con
`node:test`, usando `:memory:` para los casos deterministas y un archivo temporal
real para el caso de reinicio. Cubre persistencia del carrito (6 tests
originales de issue #4) mas el codigo de cupon aplicado, aislamiento entre
conversaciones y persistencia entre reinicios (8 tests nuevos de issue #6),
mas 10 tests nuevos de issue #9 con el mismo patron para `promotionId`,
incluyendo coexistencia con un `couponCode` aplicado, mas 1 test de
migracion (archivo con schema viejo sin `promotionId`).)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/cart/cart_db.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/cart/cart_db.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
