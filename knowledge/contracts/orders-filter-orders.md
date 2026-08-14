---
type: 'Task Contract'
title: 'Filtrado de ordenes por estado, id y rango de fecha'
description: 'Funcion pura que filtra un array de ordenes por estado exacto, substring de id, y rango de fecha de creacion, componiendo con AND.'
tags: ['ccdd', 'orders', 'dashboard']
language: typescript

task: orders_filter_orders
intent: "Filtrar ordenes por criterios de busqueda compuestos."
target: src/agent/orders/filter_orders.ts
signature: "function filterOrders(orders: Order[], filters: OrderFilters): Order[]"
test_command: "node --test src/agent/orders/filter_orders.test.ts"
budget:
  cyclomatic_max: 10
  nesting_max: 3
tests: "src/agent/orders/filter_orders.test.ts"
tests_sha256: "0594102847bdc327965aa5f86b368122a3a317616a8929be22af7422bfc47755"
touch_only: ['src/agent/orders/filter_orders.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Filtrado de ordenes

## Intent
Issue #5: "incluir filtros basicos por estado, fecha e identificador de
pedido" y criterio de aceptacion 3: "se pueden filtrar pedidos por estado y
localizar uno por identificador". Funcion pura sobre el array que devuelve
`OrdersDb.listOrders()` -- el dashboard (server.ts, no CCDD-contractado) la
llama con los query params de la peticion ya parseados; esta funcion no
sabe nada de HTTP.

## Interface
```typescript
import type { Order, OrderStatus } from "./orders_db.ts";
export interface OrderFilters {
  status?: OrderStatus;
  id?: string;
  dateFrom?: string;
  dateTo?: string;
}
function filterOrders(orders: Order[], filters: OrderFilters): Order[]
```

## Invariants
- Sin ningun filtro presente (`{}`), devuelve TODAS las ordenes, en el mismo
  orden en que llegaron (no reordena -- `listOrders()` ya las entrega
  newest-first).
- `filters.status`: coincidencia EXACTA contra `order.status`.
- `filters.id`: coincidencia por SUBSTRING, case-insensitive, contra
  `order.id` (permite busqueda parcial, ej. buscar `"a1b2"` encuentra un id
  completo que lo contenga).
- `filters.dateFrom`/`filters.dateTo`: comparacion lexicografica de strings
  ISO 8601 contra `order.createdAt` (funciona porque ISO 8601 ordena
  lexicograficamente igual que cronologicamente); ambos limites son
  INCLUSIVOS (`dateFrom <= createdAt` y `createdAt <= dateTo`).
- Los filtros presentes se combinan con AND (una orden debe cumplir TODOS
  los filtros dados para quedar en el resultado).
- NO muta el array `orders` recibido; nunca lanza.
- `orders: []` o ningun match -> `[]`.

## Examples
- `filterOrders(orders, {})` -> `orders` (todas, mismo orden).
- `filterOrders(orders, { status: "paid" })` -> solo las `paid`.
- `filterOrders(orders, { id: "ORDER-A" })` -> encuentra `"order-a"`
  (case-insensitive).
- `filterOrders(orders, { dateFrom: "2026-08-12T00:00:00.000Z" })` -> ordenes
  creadas ese dia o despues.
- `filterOrders(orders, { status: "paid", id: "order-b" })` -> solo la orden
  que cumple AMBAS condiciones.

## Do / Don't
- DO: usar `.includes()` sobre versiones en minuscula para el filtro de
  `id` (substring, no exacto).
- DO: comparar `createdAt` como STRING (`<=`/`>=`), nunca parsear a `Date`
  -- los timestamps ya son ISO 8601, comparan bien como texto.
- DON'T: tocar SQLite ni `OrdersDb` desde aca -- funcion pura sobre datos ya
  en memoria.
- DON'T: implementar paginacion ni ordenamiento configurable aca -- fuera
  del alcance de este contrato (el orden ya viene de `listOrders()`).

## Tests
(Los tests estan en `src/agent/orders/filter_orders.test.ts`, oraculo
congelado con `node:test`, con un array fijo de 3 ordenes en memoria -- sin
SQLite real.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/orders/filter_orders.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/orders/filter_orders.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
