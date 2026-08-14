---
type: 'Task Contract'
title: 'Renderer de la pagina de pago mock (seguro contra XSS)'
description: 'Renderiza HTML de una orden con montos en ARS; muestra formularios aprobar/rechazar solo si esta pending_payment, texto de resultado si ya se resolvio.'
tags: ['ccdd', 'web', 'orders', 'payments', 'security']
language: typescript

task: web_render_pay_page
intent: "Renderizar la pagina mock de pago de una orden."
target: src/agent/web/render_pay_page.ts
signature: "function renderPayPage(order: Order): string"
test_command: "node --test src/agent/web/render_pay_page.test.ts"
budget:
  cyclomatic_max: 10
  nesting_max: 3
tests: "src/agent/web/render_pay_page.test.ts"
tests_sha256: "067b2d2be3c995ed6686b88c9c4afcda1f8732ed90ae521391f0a10552b68fae"
touch_only: ['src/agent/web/render_pay_page.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Renderer de la pagina de pago mock

## Intent
Issue #4 (batch 3): "ofrecer una pagina local de pago mock a la que el
usuario llega desde ese enlace" y "permitir simular al menos los resultados
`approved` y `rejected` desde la pagina mock". Esta funcion pura arma el HTML
completo de esa pagina a partir de una `Order` ya cargada (server.ts, batch
siguiente, la resuelve por `payToken` via `OrdersDb.getOrderByPayToken` y
llama esta funcion). Mismo espiritu de seguridad que
[web-render-markdown](./web-render-markdown.md): escapar TODO antes de
interpolar, aunque los datos vengan del propio catalogo (no del usuario) --
defensa en profundidad.

## Interface
```typescript
import type { Order } from "../orders/orders_db.ts";
function renderPayPage(order: Order): string
```

## Invariants
- El HTML resultante SIEMPRE incluye `order.id` y el total formateado en
  pesos argentinos: `order.totalCents` se divide por 100, se formatea con
  coma decimal y punto de miles (`"$ 138,00"` para `13800` centavos, `"$
  1.500,00"` para `150000` centavos).
- Lista cada item de `order.items` mostrando `name`, `quantity`, y su
  `unitPriceCents` formateado con la misma regla ARS.
- TODO valor interpolado (nombre de item, cualquier texto que no sea
  generado por este archivo) se escapa con las mismas reglas HTML que
  `render_markdown.ts` (`&`, `<`, `>`, `"`, `'`) ANTES de insertarse en el
  HTML -- un nombre de producto como `<script>` nunca aparece sin escapar.
- Si `order.status === "pending_payment"`: el HTML incluye DOS `<form>`
  (`method="post"`) — uno con `action="/pay/<payToken>/approve"` y otro con
  `action="/pay/<payToken>/reject"` (usando `order.payToken` tal cual, sin
  escapar de mas ya que es un UUID generado por el sistema).
- Si `order.status` es `"paid"`, `"payment_failed"` o `"cancelled"`: el HTML
  NO incluye ningun `<form>` (la decision ya esta tomada, no se puede volver
  a aprobar/rechazar) y muestra un mensaje de resultado en espanol que
  contenga la palabra "aprobad..." (paid), "rechazad..." (payment_failed) o
  "cancelad..." (cancelled) en algun lugar del texto.

## Examples
- Orden `pending_payment`, `totalCents: 13800` -> el HTML contiene
  `"order-1"`, `"$ 138,00"`, `"Abominable Hoodie"`, y ambos `<form
  action="/pay/tok-1/approve" ... method="post">` /
  `<form action="/pay/tok-1/reject" ... method="post">`.
- Orden `status: "paid"` -> el HTML NO contiene `<form`, contiene un texto
  que matchea `/aprobad/i`.
- Orden `status: "payment_failed"` -> sin `<form`, texto que matchea
  `/rechazad/i`.
- Item con `name: "<script>alert(1)</script>"` -> el HTML NO contiene
  `<script>` literal, contiene `&lt;script&gt;`.

## Do / Don't
- DO: escapar primero, interpolar despues -- igual disciplina que
  `render_markdown.ts`.
- DO: usar `order.payToken` (UUID controlado por el sistema, no input de
  usuario) directamente en las URLs de los formularios sin necesidad de
  escaparlo como texto HTML aparte de la interpolacion normal.
- DON'T: usar ninguna dependencia npm de templating/sanitizacion
  (`deps_allowed: []`).
- DON'T: leer `OrdersDb` ni hacer ningun I/O aca -- la funcion es pura, opera
  sobre la `Order` que ya le paso quien la llama.

## Tests
(Los tests estan en `src/agent/web/render_pay_page.test.ts`, oraculo
congelado con `node:test`: id de orden, formato ARS con y sin separador de
miles, listado de items, formularios aprobar/rechazar cuando esta pendiente,
ausencia de formularios y mensaje correcto para `paid`/`payment_failed`/
`cancelled`, y escapado de un nombre de item malicioso.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/web/render_pay_page.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/web/render_pay_page.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
