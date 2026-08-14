---
type: 'Task Contract'
title: 'Elegibilidad y calculo determinista de una promocion vinculada entre productos'
description: 'Funcion pura que valida si una regla de promocion vinculada (producto trigger -> descuento en otro producto) aplica a un carrito, y calcula el descuento resultante en centavos.'
tags: ['ccdd', 'promotions', 'cart']
language: typescript

task: promotions_evaluate_promotion
intent: "Evaluar deterministicamente una promocion vinculada contra un carrito."
target: src/agent/promotions/evaluate_promotion.ts
signature: "function evaluatePromotion(cart: Cart, rule: PromotionRule | null, discountProductUnitPriceCents: number | null): PromotionEvaluation"
test_command: "node --test src/agent/promotions/evaluate_promotion.test.ts"
budget:
  cyclomatic_max: 10
  nesting_max: 3
tests: "src/agent/promotions/evaluate_promotion.test.ts"
tests_sha256: "e502ddcc1df4364b7f0e88180bc49401959ea10a43f379edf1d886c2246ba965"
touch_only: ['src/agent/promotions/evaluate_promotion.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Elegibilidad y calculo de promocion vinculada

## Intent
Issue #9 ("Promociones vinculadas entre productos"), extraido de issue #6
criterio de aceptacion 3 ("se puede sugerir una promocion vinculada a un
producto y aplicarla solo tras confirmacion explicita"). El usuario decidio
el mecanismo: cuando el agente sugiere la promocion y el usuario CONFIRMA,
el producto B se agrega al carrito CON el descuento en el mismo paso (no
requiere que B ya este en el carrito de antemano) -- por eso esta funcion no
busca `discountProductId` dentro de `cart.items`, sino que recibe el precio
unitario de B ya resuelto por quien llama (desde el catalogo) y calcula el
descuento para AGREGARLO con ese precio.

Mismo patron que [coupons-evaluate-coupon](./coupons-evaluate-coupon.md):
funcion PURA, sin acceso a SQLite ni catalogo -- quien llama resuelve la
`PromotionRule` (desde `promotions_db.ts`) y el precio del producto B (desde
el catalogo) antes de invocar esta funcion.

La interaccion con cupones (`combinableWithCoupons` en la regla,
`appliesToPromotionalItems` en el cupon, y que gane el cupon si contradicen)
NO se resuelve aca -- es logica de un batch posterior que combina esta
evaluacion con [coupons-evaluate-coupon](./coupons-evaluate-coupon.md). Esta
funcion solo evalua la promocion en aislamiento.

## Interface
```typescript
import type { Cart } from "../cart/cart_db.ts";
export interface PromotionRule {
  triggerProductId: string;
  discountProductId: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  combinableWithCoupons: boolean;
  active: boolean;
}
export interface PromotionEvaluation {
  applicable: boolean;
  reason: string | null;
  discountCents: number | null;
}
function evaluatePromotion(cart: Cart, rule: PromotionRule | null, discountProductUnitPriceCents: number | null): PromotionEvaluation
```

## Invariants
- `rule: null` (id de promocion no encontrado por quien llama) -> `{
  applicable: false, reason: "promotion not found", discountCents: null }`.
- `rule.active === false` -> `{ applicable: false, reason: "promotion not
  active", discountCents: null }` (se chequea ANTES que la presencia del
  trigger -- una regla desactivada nunca aplica, sin importar el carrito).
- Ningun item de `cart.items` tiene `productId === rule.triggerProductId`
  (incluye el caso de `cart.items` vacio) -> `{ applicable: false, reason:
  "trigger product not in cart", discountCents: null }`.
- `discountProductUnitPriceCents === null` (precio de B desconocido en el
  catalogo) -> `{ applicable: false, reason: "discount product price
  unknown", discountCents: null }`.
- Si pasa todas las validaciones: `applicable: true`, `reason: null`,
  `discountCents` calculado sobre `discountProductUnitPriceCents`:
  - `discountType: "percentage"` -> `round(discountProductUnitPriceCents *
    discountValue / 100)`.
  - `discountType: "fixed"` -> `min(discountValue,
    discountProductUnitPriceCents)` (el descuento nunca supera el precio
    unitario de B, evita un precio final negativo).
- NO muta `cart`; nunca lanza.

## Examples
- `rule: null` -> `{ applicable: false, reason: "promotion not found",
  discountCents: null }`.
- Regla `active: false` -> `{ applicable: false, reason: "promotion not
  active" }`.
- Carrito sin el producto trigger -> `{ applicable: false, reason: "trigger
  product not in cart" }`.
- Carrito vacio -> `{ applicable: false, reason: "trigger product not in
  cart" }`.
- Trigger presente, `discountProductUnitPriceCents: null` -> `{ applicable:
  false, reason: "discount product price unknown" }`.
- Trigger presente, regla `percentage` 50%, precio de B `5500` -> `{
  applicable: true, reason: null, discountCents: 2750 }`.
- Trigger presente, regla `fixed` de `99999`, precio de B `5500` -> `{
  applicable: true, discountCents: 5500 }` (capado al precio unitario).
- Trigger presente, regla `fixed` de `1000`, precio de B `5500` -> `{
  applicable: true, discountCents: 1000 }` (sin capar, el fijo es menor).

## Do / Don't
- DO: chequear `active` antes que la presencia del trigger en el carrito
  (orden de validacion importa para el `reason` devuelto).
- DO: redondear el descuento porcentual con `Math.round`.
- DON'T: buscar `discountProductId` dentro de `cart.items` -- el flujo
  decidido agrega el producto B recien al confirmar, no valida que ya este
  en el carrito.
- DON'T: resolver la regla por id, ni el precio del producto por catalogo
  -- eso es responsabilidad de quien llama (`promotions_db.ts` +
  `catalog_db.ts`).
- DON'T: implementar aca la interaccion con cupones
  (`combinableWithCoupons`/`appliesToPromotionalItems`) -- es un batch
  posterior.

## Tests
(Los tests estan en `src/agent/promotions/evaluate_promotion.test.ts`,
oraculo congelado con `node:test`, con carritos fijos en memoria -- sin
SQLite real.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/promotions/evaluate_promotion.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/promotions/evaluate_promotion.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
