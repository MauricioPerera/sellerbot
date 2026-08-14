---
type: 'Task Contract'
title: 'Tool del agente: view_cart'
description: 'Wrapper AgentTool que devuelve el resumen actual del carrito de la conversacion (items, subtotales, total), incluyendo descuento si hay un cupon valido aplicado.'
tags: ['ccdd', 'agent', 'cart', 'coupons', 'tool']
language: typescript

task: agent_tool_view_cart
intent: "Exponer el resumen del carrito, con descuento si aplica."
target: src/agent/tools/view_cart.ts
signature: "function viewCartTool(cartDb: CartDb, coupons: Coupon[], conversationId: string): AgentTool"
test_command: "node --test src/agent/tools/view_cart.test.ts"
budget:
  cyclomatic_max: 8
  nesting_max: 3
tests: "src/agent/tools/view_cart.test.ts"
tests_sha256: "39603b551774107d6aa87a82ce33fe6a62b228b1c4e4930c00191b09de2b4ded"
touch_only: ['src/agent/tools/view_cart.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente view_cart

## Intent
Issue #4: "cuando el usuario pregunte '¿que tengo en el carrito?', el agente
muestra un resumen claro con items, cantidades, subtotal y cualquier dato
pendiente". Puente de solo lectura entre [cart-cart-db](./cart-cart-db.md) y
[cart-cart-summary](./cart-cart-summary.md) -- a diferencia de las otras 3
tools del carrito, esta no tiene efecto secundario (no llama `saveCart`).

Issue #6 batch 2: "el detalle del carrito ... refleja items, descuentos y
total final". Si hay un cupon aplicado (`cartDb.getCouponCode`), esta tool
lo RE-EVALUA en el momento (nunca confia en un descuento cacheado -- el
carrito pudo cambiar desde que se aplico) via
[coupons-evaluate-coupon](./coupons-evaluate-coupon.md); si sigue siendo
valido, agrega los campos de descuento; si ya no lo es (cambio el carrito,
o el codigo ya no existe en `coupons`), se comporta EXACTAMENTE como si no
hubiera cupon aplicado -- no informa un error, simplemente omite los campos
extra (auto-sanacion silenciosa, sin tocar la base -- el cupon invalido NO
se borra automaticamente de `cartDb`, solo no se refleja en este resumen).

## Interface
```typescript
import type { Coupon } from "../coupons/evaluate_coupon.ts";
function viewCartTool(cartDb: CartDb, coupons: Coupon[], conversationId: string): AgentTool
```

## Invariants
- `name` es siempre `"view_cart"`; `parameters` no exige ningun argumento
  (`required: []`, `additionalProperties: false`) -- el `conversationId` ya
  esta fijado por closure al construir la tool, no lo decide el modelo.
- `execute({})` lee el carrito via `cartDb.getCart(conversationId)`; si es
  `null` (conversacion sin carrito todavia), se trata como un carrito vacio
  (`{ items: [], totalCents: 0 }`) sin escribir nada en la base.
- Si `cartDb.getCouponCode(conversationId)` es `null`, O el codigo no
  coincide con ningun `coupons[i].code`, O `evaluateCoupon` sobre el
  carrito actual devuelve `valid: false`: el resultado es EXACTAMENTE
  `summarizeCart(cart)` sin campos adicionales (mismo shape que antes de
  este batch -- `{ items, totalCents }`, nada mas).
- Si el codigo coincide y `evaluateCoupon` devuelve `valid: true`: el
  resultado extiende `summarizeCart(cart)` con `couponCode` (el codigo tal
  cual esta guardado), `discountCents` (de la evaluacion), y
  `finalTotalCents` (`totalCents - discountCents`).
- Nunca lanza; nunca llama `cartDb.saveCart` ni `setCouponCode` (sigue
  siendo de solo lectura, incluso cuando el cupon aplicado ya no es
  valido).

## Examples
- Conversacion sin carrito -> `execute({})` -> `{ items: [], totalCents: 0 }`.
- Carrito con un item, sin cupon aplicado -> `{ items: [...],
  totalCents: 6900 }` (shape identico al de antes de issue #6).
- Carrito con un item y `"WELCOME10"` (10%) aplicado y valido -> `{
  items: [...], totalCents: 6900, couponCode: "WELCOME10", discountCents:
  690, finalTotalCents: 6210 }`.
- Cupon aplicado pero que ya no cumple su minimo de compra (el carrito
  cambio) -> el resultado NO incluye `couponCode`/`discountCents`/
  `finalTotalCents`, igual que si no hubiera cupon.
- Cupon aplicado cuyo codigo ya no existe en `coupons` (dataset cambio) ->
  mismo comportamiento: se omite silenciosamente.

## Do / Don't
- DO: delegar el calculo de subtotales/total a `summarizeCart`
  (`cart_summary.ts`) -- esta tool solo hace el fetch y pasa el resultado.
- DO: re-evaluar el cupon con `evaluateCoupon` en cada llamada, usando
  `new Date().toISOString()` como `now` -- nunca confiar en que sigue
  siendo valido solo porque esta guardado.
- DON'T: llamar `cartDb.saveCart` ni `setCouponCode` desde aca -- `view_cart`
  sigue siendo de solo lectura, incluso para "limpiar" un cupon invalido.
- DON'T: formatear moneda ARS aca -- el resultado en centavos es
  responsabilidad de capas superiores.

## Tests
(Los tests estan en `src/agent/tools/view_cart.test.ts`, oraculo congelado con
`node:test`, usando `openCartDb(":memory:")` -- sin red. Cubre el shape
original sin cupon (4 tests de issue #4) mas los 3 casos con cupon: aplicado
y valido, aplicado pero ya invalido, y aplicado con codigo inexistente en
`coupons` (issue #6).)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/view_cart.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/view_cart.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
