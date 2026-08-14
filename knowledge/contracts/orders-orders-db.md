---
type: 'Task Contract'
title: 'Almacen SQLite de ordenes, pagos y eventos (maquina de estados)'
description: 'Persiste ordenes/pagos/eventos con transiciones validas unicamente: pending_payment->paid|payment_failed, un pago no puede resolverse dos veces.'
tags: ['ccdd', 'orders', 'payments', 'sqlite']
language: typescript

task: orders_orders_db
intent: "Persistir ordenes de compra con transiciones de estado validas."
target: src/agent/orders/orders_db.ts
signature: "function openOrdersDb(location: string): OrdersDb"
test_command: "node --test src/agent/orders/orders_db.test.ts"
budget:
  cyclomatic_max: 16
  nesting_max: 4
tests: "src/agent/orders/orders_db.test.ts"
tests_sha256: "9b0e96aaef16c6f53dc574ebe3a39e9297aaf30e4f04e864135164e92d282fa5"
touch_only: ['src/agent/orders/orders_db.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Almacen SQLite de ordenes y pagos

## Intent
Issue #4 (batch 2, sobre el carrito ya construido en batch 1): "una confirmacion
explicita ... convierte el carrito en una orden `pending_payment`". Este contrato
persiste esa orden, un pago asociado, y un log de eventos auditable, aplicando el
modelo de estados propuesto por el issue:
```text
Orden: pending_payment -> paid | payment_failed | cancelled
Pago:  pending -> approved | rejected
```
Solo se materializan ordenes en `pending_payment` (el estado `draft` del modelo
del issue es el carrito mismo, batch 1 -- no se persiste una orden `draft`). Cada
orden tiene EXACTAMENTE un pago en este batch (retry-con-nuevo-pay-link es
explicitamente opcional en el issue, "si el diseno lo contempla" -- queda fuera
de este batch). Mismo patron `node:sqlite` que `cart_db.ts`/`catalog_db.ts`, con
la novedad de que `createOrder` y `setPaymentResult` escriben MULTIPLES filas
relacionadas (orden + pago + evento) de forma atomica.

## Interface
```typescript
export type OrderStatus = "pending_payment" | "paid" | "payment_failed" | "cancelled";
export type PaymentStatus = "pending" | "approved" | "rejected";
export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number | null;
}
export interface Order {
  id: string;
  conversationId: string;
  status: OrderStatus;
  items: OrderItem[];
  totalCents: number;
  payToken: string;
  createdAt: string;
  updatedAt: string;
}
export interface Payment {
  orderId: string;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}
export interface OrderEvent {
  orderId: string;
  type: string;
  createdAt: string;
}
export interface OrdersDb {
  createOrder(conversationId: string, items: OrderItem[], totalCents: number): Order;
  getOrder(orderId: string): Order | null;
  getOrderByPayToken(payToken: string): Order | null;
  getPayment(orderId: string): Payment | null;
  setPaymentResult(orderId: string, result: "approved" | "rejected"): { order: Order; payment: Payment };
  listEvents(orderId: string): OrderEvent[];
  close(): void;
}
function openOrdersDb(location: string): OrdersDb
```

## Invariants
- `createOrder(conversationId, items, totalCents)` genera un `id` y un `payToken`
  nuevos (ambos strings unicos, ej. `crypto.randomUUID()`, DISTINTOS entre si),
  crea la orden con `status: "pending_payment"`, crea un `Payment` asociado con
  `status: "pending"`, y agrega un `OrderEvent` con `type: "order_created"`.
  `createdAt`/`updatedAt` se estampan con la hora real (`new
  Date().toISOString()`) en el momento de la creacion.
- `createOrder` con `items: []` LANZA (no se puede confirmar una compra vacia).
- `getOrder(id)`/`getOrderByPayToken(token)` devuelven `null` si no existe,
  nunca lanzan. `getOrderByPayToken` encuentra la MISMA orden que devolveria
  `getOrder` con el `id` correspondiente (el `payToken` es un puntero
  alternativo a la misma orden, usado para la pagina de pago).
- `getPayment(orderId)` devuelve `null` si la orden no existe (nunca lanza).
- `setPaymentResult(orderId, result)`:
  - LANZA si `orderId` no existe.
  - LANZA si el pago de esa orden YA esta resuelto (`status` `"approved"` o
    `"rejected"`) -- un pago nunca se aprueba/rechaza dos veces (criterio de
    aceptacion 5 del issue #4).
  - `result: "approved"` -> el pago pasa a `"approved"` y la orden a `"paid"`.
  - `result: "rejected"` -> el pago pasa a `"rejected"` y la orden a
    `"payment_failed"`.
  - Agrega un `OrderEvent` con `type: "payment_approved"` o
    `"payment_rejected"` segun corresponda; actualiza `updatedAt` en orden y
    pago.
  - Devuelve `{ order, payment }` ya actualizados.
- `listEvents(orderId)` devuelve los eventos de esa orden en orden
  CRONOLOGICO (orden de insercion); `[]` si la orden no existe o no tiene
  eventos.
- Reabrir el mismo archivo preserva las ordenes/pagos/eventos ya guardados
  (mismo patron de sobrevivir un reinicio que `catalog_db.ts`/`cart_db.ts`).
- `close()` libera el handle; no se usa el `OrdersDb` despues.

## Examples
- `createOrder("conv-1", [...items], 13800)` -> `Order` con `status:
  "pending_payment"`; `getPayment(order.id)` -> `{ status: "pending", ... }`.
- `setPaymentResult(order.id, "approved")` -> `{ order: {status: "paid", ...},
  payment: {status: "approved", ...} }`.
- `setPaymentResult(order.id, "approved")` llamado DE NUEVO sobre la misma
  orden -> lanza (ya estaba resuelto).
- `listEvents(order.id)` tras crear + aprobar -> `[{type: "order_created"},
  {type: "payment_approved"}]`, en ese orden.
- `createOrder("conv-1", [], 0)` -> lanza.

## Do / Don't
- DO: usar `node:sqlite` (`DatabaseSync`) del core de Node, sin dependencia npm.
- DO: escribir orden + pago + evento como parte de la misma llamada
  (`createOrder`/`setPaymentResult`), no dejar la escritura parcial si algo
  falla a mitad de camino -- usar una transaccion SQLite si hace falta
  (`db.exec("BEGIN")`/`"COMMIT"`) o escribir en un orden que no deje estado
  inconsistente ante un error.
- DO: `items`/`OrderItem[]` se serializan como columna `TEXT` con
  `JSON.stringify`/`JSON.parse`, igual que `items` en `cart_db.ts`.
- DON'T: implementar aca la logica de "convertir el carrito en orden" -- eso
  vive en la tool `confirm_purchase` (batch siguiente), que LLAMA a
  `createOrder` con los items ya resueltos desde el carrito.
- DON'T: soportar mas de un pago por orden en este batch (retry con nuevo pay
  link queda fuera de alcance, es opcional segun el issue).

## Tests
(Los tests estan en `src/agent/orders/orders_db.test.ts`, oraculo congelado con
`node:test`, usando `:memory:` para los casos deterministas y un archivo
temporal real para el caso de reinicio.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/orders/orders_db.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/orders/orders_db.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
