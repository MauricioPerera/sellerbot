---
type: 'Task Contract'
title: 'Tool del agente: apply_coupon'
description: 'Wrapper AgentTool que resuelve un codigo de cupon contra el dataset dummy, lo evalua contra el carrito, y persiste el codigo solo si es valido.'
tags: ['ccdd', 'agent', 'coupons', 'cart', 'tool']
language: typescript

task: agent_tool_apply_coupon
intent: "Aplicar un cupon al carrito si es elegible."
target: src/agent/tools/apply_coupon.ts
signature: "function applyCouponTool(cartDb: CartDb, coupons: Coupon[], conversationId: string): AgentTool"
test_command: "node --test src/agent/tools/apply_coupon.test.ts"
budget:
  cyclomatic_max: 10
  nesting_max: 3
tests: "src/agent/tools/apply_coupon.test.ts"
tests_sha256: "ad2c855e7641821968a4621c61c2663453c77416e2774291cb57050eb644f4d0"
touch_only: ['src/agent/tools/apply_coupon.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente apply_coupon

## Intent
Issue #6 batch 2: "un cupon valido se aplica al carrito y modifica el total
de forma deterministica" y "un cupon invalido o no elegible devuelve una
explicacion precisa sin alterar el carrito". Puente entre el dataset dummy
de cupones (`coupons: Coupon[]`, snapshot pasado por quien arma la tool --
mismo patron que `catalog: DbProduct[]` en `search_products.ts`),
[coupons-evaluate-coupon](./coupons-evaluate-coupon.md) (la validacion) y
[cart-cart-db](./cart-cart-db.md) (`setCouponCode`, la persistencia).

## Interface
```typescript
import type { Coupon } from "../coupons/evaluate_coupon.ts";
function applyCouponTool(cartDb: CartDb, coupons: Coupon[], conversationId: string): AgentTool
```

## Invariants
- `name` es siempre `"apply_coupon"`; `parameters` exige `code: string`
  (`required`, `additionalProperties: false`).
- `execute({ code })` con `code` no-string devuelve `{ error: "code must be
  a string" }`, nunca lanza.
- Resuelve el cupon buscando en `coupons` un `code` que coincida
  CASE-INSENSITIVE con el `code` recibido (comparando en mayusculas, igual
  que `findCoupon` en `coupons_data.ts`) -- si no hay match, el `coupon`
  pasado a `evaluateCoupon` es `null`.
- Lee el carrito actual via `cartDb.getCart(conversationId)` (o un carrito
  vacio si no existe todavia) y llama `evaluateCoupon(cart, coupon,
  new Date().toISOString())`.
- Si `evaluation.valid` es `false`: devuelve `{ error: evaluation.reason }`
  SIN llamar `cartDb.setCouponCode` -- el carrito queda intacto.
- Si `evaluation.valid` es `true`: llama `cartDb.setCouponCode(conversationId,
  <code del cupon resuelto, en mayusculas>)`, y devuelve `{ code:
  <codigo en mayusculas>, discount_cents: evaluation.discountCents,
  subtotal_cents: <total de summarizeCart(cart)>, total_cents:
  subtotal_cents - discount_cents }`.
- Aplicar un cupon nuevo mientras ya habia uno aplicado SIMPLEMENTE lo
  reemplaza en el intento exitoso (via `setCouponCode`); un intento fallido
  (cupon invalido) NO toca el cupon previamente aplicado, si lo habia.
- Nunca lanza.

## Examples
- Carrito con subtotal `19300`, `execute({ code: "WELCOME10" })` (10% sin
  restricciones) -> `{ code: "WELCOME10", discount_cents: 1930,
  subtotal_cents: 19300, total_cents: 17370 }`; `cartDb.getCouponCode`
  refleja `"WELCOME10"`.
- `execute({ code: "welcome10" })` (minusculas) -> mismo resultado,
  case-insensitive.
- `execute({ code: "NOPE" })` (no existe en `coupons`) -> `{ error: "coupon
  not found" }`, `cartDb.getCouponCode` sigue siendo lo que era antes.
- `execute({ code: "EXPIRED" })` (existe pero vencido) -> `{ error: <razon
  de evaluateCoupon> }`, no se persiste.
- Carrito vacio -> `{ error: "cart is empty" }`.

## Do / Don't
- DO: delegar TODA la logica de elegibilidad/calculo a `evaluateCoupon`
  (`coupons/evaluate_coupon.ts`) -- esta tool solo resuelve el codigo,
  llama, y persiste si corresponde.
- DO: normalizar `code` a mayusculas antes de comparar y antes de
  persistir (consistente con `coupons_data.ts`).
- DON'T: persistir el cupon si `evaluateCoupon` lo rechaza -- el carrito
  debe quedar exactamente como estaba.
- DON'T: reimplementar el calculo de subtotal -- usar `summarizeCart`
  (`cart/cart_summary.ts`).

## Tests
(Los tests estan en `src/agent/tools/apply_coupon.test.ts`, oraculo
congelado con `node:test`, usando `openCartDb(":memory:")` y un array fijo
de 2 cupones en memoria -- sin red.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/apply_coupon.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/apply_coupon.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
