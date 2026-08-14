---
type: 'Task Contract'
title: 'Elegibilidad y calculo determinista de descuento de un cupon'
description: 'Funcion pura que valida vigencia, minimo de compra y aplicabilidad por producto de un cupon contra un carrito, y calcula el descuento resultante en centavos.'
tags: ['ccdd', 'coupons', 'cart']
language: typescript

task: coupons_evaluate_coupon
intent: "Evaluar deterministicamente un cupon contra un carrito."
target: src/agent/coupons/evaluate_coupon.ts
signature: "function evaluateCoupon(cart: Cart, coupon: Coupon | null, now: string): CouponEvaluation"
test_command: "node --test src/agent/coupons/evaluate_coupon.test.ts"
budget:
  cyclomatic_max: 14
  nesting_max: 4
tests: "src/agent/coupons/evaluate_coupon.test.ts"
tests_sha256: "c620334ff46497ce9f1cefb7bdf798ddf48b4910de063b02e9e2ecaf0c5ff480"
touch_only: ['src/agent/coupons/evaluate_coupon.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Elegibilidad y calculo de cupon

## Intent
Issue #6 (batch 1, SIN promociones vinculadas -- decision explicita del
usuario para esta primera entrega): "validar elegibilidad de un cupon antes
de aplicarlo: vigencia, items/variaciones aplicables, minimo de compra, uso
unico u otras reglas explicitas" y "los descuentos se calculan de forma
deterministica por una capa de dominio, no por texto generado por el
modelo". Esta es esa capa: una funcion PURA que toma el carrito ya
persistido ([cart-cart-db](./cart-cart-db.md)), un `Coupon` YA RESUELTO por
codigo (quien llama busca el codigo en el dataset dummy de cupones -- esta
funcion no sabe de donde vienen los cupones, solo evalua UNO contra un
carrito), y el timestamp actual (inyectado, no `Date.now()`, para que la
funcion sea pura y testeable sin reloj real).

`uso unico` (single-use) queda FUERA de este contrato: requiere rastrear si
un codigo ya se uso, lo cual es estado persistente (batch 2, cuando se
integre con SQLite) -- esta funcion solo evalua las reglas ESTRUCTURALES del
cupon (vigencia, minimo, aplicabilidad) contra un carrito dado.

Issue #9 (promociones vinculadas) agrega `appliesToPromotionalItems:
boolean` a `Coupon`: indica si el DESCUENTO de este cupon puede aplicarse
tambien a un item que ya tiene una promocion vinculada activa (ver
[promotions-evaluate-promotion](./promotions-evaluate-promotion.md)). Es
SOLO un campo de datos -- `evaluateCoupon` no lo lee ni cambia su
comportamiento por el; la logica que lo combina con
`PromotionRule.combinableWithCoupons` (dando prioridad al cupon si
contradicen, decision del usuario) vive en un batch posterior que combina
ambas evaluaciones.

## Interface
```typescript
import type { Cart } from "../cart/cart_db.ts";
export interface Coupon {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minPurchaseCents: number | null;
  validFrom: string | null;
  validUntil: string | null;
  applicableProductIds: string[] | null;
  appliesToPromotionalItems: boolean;
}
export interface CouponEvaluation {
  valid: boolean;
  reason: string | null;
  discountCents: number | null;
}
function evaluateCoupon(cart: Cart, coupon: Coupon | null, now: string): CouponEvaluation
```

## Invariants
- `coupon: null` (codigo no encontrado por quien llama) -> `{ valid: false,
  reason: "coupon not found", discountCents: null }`.
- `cart.items.length === 0` -> `{ valid: false, reason: <menciona "empty" o
  "vacio">, discountCents: null }`.
- Si CUALQUIER item del carrito relevante para el calculo tiene
  `unitPriceCents: null`, la evaluacion es invalida (`reason` menciona
  "price"/"precio") -- no se puede calcular un descuento con precio
  desconocido, mismo criterio que `confirm_purchase.ts`.
- `coupon.validFrom` no nulo y `now < validFrom` -> invalido (`reason`
  menciona que aun no es valido/vigente).
- `coupon.validUntil` no nulo y `now > validUntil` -> invalido (`reason`
  menciona expirado/vencido). Comparacion de fechas por STRING ISO 8601
  (lexicografica), igual que `filter_orders.ts`.
- "Subtotal elegible": si `coupon.applicableProductIds` es `null`, es la
  suma de `unitPriceCents * quantity` de TODOS los items del carrito; si no
  es `null`, es la suma SOLO de los items cuyo `productId` esta en esa
  lista.
- `coupon.applicableProductIds` no nulo y NINGUN item del carrito tiene un
  `productId` en esa lista -> invalido (`reason` menciona
  "eligible"/"aplicable").
- `coupon.minPurchaseCents` no nulo y el subtotal COMPLETO del carrito
  (suma de TODOS los items, no solo los elegibles) es menor a
  `minPurchaseCents` -> invalido (`reason` menciona "minimum"/"minimo").
- Si pasa todas las validaciones: `valid: true`, `reason: null`,
  `discountCents` calculado sobre el SUBTOTAL ELEGIBLE:
  - `discountType: "percentage"` -> `round(subtotalElegible *
    discountValue / 100)`.
  - `discountType: "fixed"` -> `min(discountValue, subtotalElegible)` (el
    descuento nunca puede superar el subtotal elegible, evita totales
    negativos).
- NO muta `cart`; nunca lanza.

## Examples
- Carrito con subtotal `19300`, cupon `10%` sin restricciones -> `{ valid:
  true, discountCents: 1930, reason: null }`.
- Cupon `fixed` de `50000` sobre un subtotal elegible de `19300` -> `{
  valid: true, discountCents: 19300 }` (capado, no negativo).
- Cupon con `validUntil` en el pasado -> `{ valid: false, reason:
  "<mensaje de vencido>", discountCents: null }`.
- Cupon con `applicableProductIds: ["145"]` sobre un carrito con items
  `"145"` y `"193"` -> descuento calculado SOLO sobre el subtotal de
  `"145"`.
- Cupon con `applicableProductIds: ["999"]` y ningun item del carrito con
  ese id -> invalido.
- `evaluateCoupon(cart, null, now)` -> invalido, "coupon not found".
- Mismo cupon con `appliesToPromotionalItems: true` vs `false` -> resultado
  IDENTICO (el campo no participa en el calculo de esta funcion).

## Do / Don't
- DO: usar `now` (parametro) para TODA comparacion de fecha -- nunca
  `Date.now()`/`new Date()` dentro de la funcion (rompe la pureza).
- DO: redondear el descuento porcentual con `Math.round` (aritmetica
  entera, sin arrastrar ruido de coma flotante mas alla del redondeo
  final).
- DON'T: implementar aca resolucion de codigo->Coupon (dataset de cupones)
  ni tracking de uso unico -- eso es responsabilidad de quien llama /
  batches siguientes.
- DON'T: implementar promociones vinculadas entre productos (issue #6 lo
  incluye en el alcance general, pero el usuario pidio explicitamente
  dejarlas fuera de este batch; ver issue #9 para ese alcance).
- DON'T: usar `appliesToPromotionalItems` (issue #9) dentro de esta
  funcion -- el campo se agrega a la interfaz `Coupon` para que un batch
  posterior lo lea al COMBINAR esta evaluacion con
  [promotions-evaluate-promotion](./promotions-evaluate-promotion.md); esta
  funcion sigue evaluando el cupon en aislamiento, sin saber que existen
  promociones.

## Tests
(Los tests estan en `src/agent/coupons/evaluate_coupon.test.ts`, oraculo
congelado con `node:test`, con un carrito fijo de 2 items en memoria -- sin
SQLite real. 14 tests originales de issue #6, mas 1 test nuevo de issue #9
que confirma que `appliesToPromotionalItems` no afecta el resultado de esta
funcion.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/coupons/evaluate_coupon.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/coupons/evaluate_coupon.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
