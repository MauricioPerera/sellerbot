---
type: 'Task Contract'
title: 'Almacen SQLite de ordenes, pagos y eventos (maquina de estados)'
description: 'Persiste ordenes/pagos/eventos con transiciones validas: pending_payment->paid|payment_failed, y transiciones administrativas paid->shipped, paid|pending_payment->cancelled, con auditoria.'
tags: ['ccdd', 'orders', 'payments', 'sqlite']
language: typescript

task: orders_orders_db
intent: "Persistir ordenes de compra con transiciones de estado validas."
target: src/agent/orders/orders_db.ts
signature: "function openOrdersDb(location: string): OrdersDb"
test_command: "node --test src/agent/orders/orders_db.test.ts"
budget:
  cyclomatic_max: 20
  nesting_max: 4
tests: "src/agent/orders/orders_db.test.ts"
tests_sha256: "01f41bdd60962e827f6c4238b5a1ba472a6bfee42f9a54ece17a8703815f4e02"
touch_only: ['src/agent/orders/orders_db.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Almacen SQLite de ordenes y pagos

## Intent
Issue #4 (batch 2): "una confirmacion explicita ... convierte el carrito en una
orden `pending_payment`". Este contrato persiste esa orden, un pago asociado, y
un log de eventos auditable. Issue #5 (dashboard admin) EXTIENDE el modelo de
estados propuesto por #4 con transiciones administrativas manuales:
```text
Orden: pending_payment -> paid | payment_failed
paid -> shipped
paid | pending_payment -> cancelled
Pago:  pending -> approved | rejected
```
Solo se materializan ordenes en `pending_payment` (el estado `draft` del modelo
de #4 es el carrito mismo, batch 1 -- no se persiste una orden `draft`). Cada
orden tiene EXACTAMENTE un pago (retry-con-nuevo-pay-link es explicitamente
opcional en #4, "si el diseno lo contempla" -- queda fuera de alcance). Mismo
patron `node:sqlite` que `cart_db.ts`/`catalog_db.ts`, con la novedad de que
`createOrder`, `setPaymentResult` y `adminTransition` escriben MULTIPLES filas
relacionadas (orden + pago/evento) de forma atomica.

`adminTransition` es la pieza nueva de issue #5: "permitir cambios manuales
controlados del estado operativo del pedido, como marcarlo `shipped` ... o
`cancelled`" y "persistir quien/cuando realizo cada cambio administrativo,
junto con el estado anterior y nuevo" -- por eso `OrderEvent` gana los campos
`actor`/`fromStatus`/`toStatus`/`reason` (nulos para los eventos de sistema
`order_created`/`payment_approved`/`payment_rejected`, que no tienen un actor
humano). `listOrders` es la pieza de lectura que el dashboard (batch 2 de
issue #5) necesita para el listado -- el filtrado por estado/fecha/id vive en
la capa web (batch 2), no aca.

## Interface
```typescript
export type OrderStatus = "pending_payment" | "paid" | "payment_failed" | "shipped" | "cancelled";
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
  actor: string | null;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  reason: string | null;
  createdAt: string;
}
export interface OrdersDb {
  createOrder(conversationId: string, items: OrderItem[], totalCents: number): Order;
  getOrder(orderId: string): Order | null;
  getOrderByPayToken(payToken: string): Order | null;
  getPayment(orderId: string): Payment | null;
  setPaymentResult(orderId: string, result: "approved" | "rejected"): { order: Order; payment: Payment };
  listEvents(orderId: string): OrderEvent[];
  listOrders(): Order[];
  adminTransition(orderId: string, toStatus: "shipped" | "cancelled", actor: string, reason?: string): Order;
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
  eventos. Los eventos de sistema (`order_created`, `payment_approved`,
  `payment_rejected`) tienen `actor: null`; `order_created` tiene
  `fromStatus: null` (no hay estado previo) y `toStatus: "pending_payment"`;
  los de pago tienen `fromStatus`/`toStatus` reflejando la transicion de la
  ORDEN (no del pago). Todos los eventos de sistema tienen `reason: null`.
- `listOrders()` devuelve TODAS las ordenes existentes, ordenadas por
  `createdAt` DESCENDENTE (la mas nueva primero); `[]` si no hay ninguna.
- `adminTransition(orderId, toStatus, actor, reason?)`:
  - LANZA si `orderId` no existe.
  - `toStatus: "shipped"` SOLO es valido si el `status` actual de la orden es
    `"paid"` -- cualquier otro estado actual (incluido `"shipped"` de nuevo)
    LANZA.
  - `toStatus: "cancelled"` SOLO es valido si el `status` actual es `"paid"`
    o `"pending_payment"` -- cualquier otro estado actual (`"payment_failed"`,
    `"cancelled"` de nuevo, `"shipped"`) LANZA.
  - Si la transicion es valida: actualiza `order.status` a `toStatus`,
    estampa `updatedAt`, y agrega un `OrderEvent` con `type:
    "admin_transition"`, `actor` (tal cual se paso), `fromStatus` (el estado
    anterior), `toStatus`, y `reason` (el string pasado, o `null` si se omite
    el argumento).
  - Devuelve la `Order` ya actualizada.
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
- `listEvents(order.id)` tras crear + aprobar -> `[{type: "order_created",
  actor: null, ...}, {type: "payment_approved", actor: null, ...}]`, en ese
  orden.
- `createOrder("conv-1", [], 0)` -> lanza.
- Orden `paid`, `adminTransition(id, "shipped", "local-admin", "enviado")` ->
  `Order` con `status: "shipped"`; el ultimo evento tiene `actor:
  "local-admin"`, `fromStatus: "paid"`, `toStatus: "shipped"`, `reason:
  "enviado"`.
- Orden `pending_payment`, `adminTransition(id, "shipped", "local-admin")` ->
  lanza (solo se puede enviar una orden ya pagada).
- Orden `payment_failed`, `adminTransition(id, "cancelled", "local-admin")`
  -> lanza (una orden con pago fallido no tiene un estado "activo" que
  cancelar en este modelo -- ya quedo resuelta como fallida).

## Do / Don't
- DO: usar `node:sqlite` (`DatabaseSync`) del core de Node, sin dependencia npm.
- DO: escribir orden + pago/evento como parte de la misma llamada
  (`createOrder`/`setPaymentResult`/`adminTransition`), no dejar la escritura
  parcial si algo falla a mitad de camino -- usar una transaccion SQLite si
  hace falta (`db.exec("BEGIN")`/`"COMMIT"`) o escribir en un orden que no
  deje estado inconsistente ante un error.
- DO: `items`/`OrderItem[]` se serializan como columna `TEXT` con
  `JSON.stringify`/`JSON.parse`, igual que `items` en `cart_db.ts`.
- DO: validar la transicion de `adminTransition` ANTES de escribir nada --
  un `toStatus` invalido para el estado actual no debe dejar rastro.
- DON'T: implementar aca la logica de "convertir el carrito en orden" -- eso
  vive en la tool `confirm_purchase`, que LLAMA a `createOrder` con los items
  ya resueltos desde el carrito.
- DON'T: soportar mas de un pago por orden (retry con nuevo pay link queda
  fuera de alcance, es opcional segun el issue #4).
- DON'T: implementar aca filtros por estado/fecha/id -- `listOrders()`
  devuelve todo, el filtrado es responsabilidad de la capa web del dashboard.

## Tests
(Los tests estan en `src/agent/orders/orders_db.test.ts`, oraculo congelado con
`node:test`, usando `:memory:` para los casos deterministas y un archivo
temporal real para el caso de reinicio. Cubre creacion/pago (15 tests
originales de issue #4) mas listado y transiciones administrativas validas
e invalidas (10 tests nuevos de issue #5).)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/orders/orders_db.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/orders/orders_db.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
