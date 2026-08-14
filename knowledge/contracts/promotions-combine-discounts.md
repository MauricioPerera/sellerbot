---
type: 'Task Contract'
title: 'Combinacion determinista de descuento por cupon y por promocion vinculada'
description: 'Funcion pura que combina la evaluacion de un cupon y de una promocion vinculada sobre un carrito, resolviendo si el cupon aplica tambien al item promocionado, y calcula el total final.'
tags: ['ccdd', 'promotions', 'coupons', 'cart']
language: typescript

task: promotions_combine_discounts
intent: "Combinar deterministicamente los descuentos aplicables a un carrito."
target: src/agent/promotions/combine_discounts.ts
signature: "function combineDiscounts(cart: Cart, coupon: Coupon | null, promotionRule: PromotionRule | null, discountProductUnitPriceCents: number | null, now: string): CombinedDiscountResult"
test_command: "node --test src/agent/promotions/combine_discounts.test.ts"
budget:
  cyclomatic_max: 10
  nesting_max: 3
tests: "src/agent/promotions/combine_discounts.test.ts"
tests_sha256: "ec5b4aa350793631994296cb4334f04902c95e4f8d1fc54580de3e9d03627153"
touch_only: ['src/agent/promotions/combine_discounts.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Combinacion de descuento cupon + promocion

## Intent
Issue #9 (promociones vinculadas), decision del usuario sobre stacking:
"ambos, y si contradicen que gane el cupon" -- se refiere a
`PromotionRule.combinableWithCoupons` (intent del admin) vs
`Coupon.appliesToPromotionalItems` (intent del cupon): cuando ambos existen
y difieren, el resultado final es el que indica el CUPON. En la practica
esto significa que `combinableWithCoupons` NUNCA cambia el resultado de esta
funcion por si solo (si el cupon dice `true`, el item promocionado entra en
el pool elegible del cupon; si dice `false`, se excluye -- en ambos casos
INDEPENDIENTEMENTE de `combinableWithCoupons`); ese campo de la regla queda
como documentacion de la intencion del admin
([promotions-promotions-db](./promotions-promotions-db.md)), no como un
input de calculo aca.

Esta funcion COMPONE dos contratos ya existentes, sin reimplementar su
logica:
[coupons-evaluate-coupon](./coupons-evaluate-coupon.md) y
[promotions-evaluate-promotion](./promotions-evaluate-promotion.md). El
"filtrado" del item promocionado del pool del cupon (cuando
`appliesToPromotionalItems: false`) se logra pasandole a `evaluateCoupon`
un carrito SINTETICO sin ese item -- `evaluateCoupon` en si mismo NO sabe
que existen promociones (por diseno, ver su contrato).

## Interface
```typescript
import type { Cart } from "../cart/cart_db.ts";
import type { Coupon } from "../coupons/evaluate_coupon.ts";
import type { PromotionRule } from "./evaluate_promotion.ts";
export interface CombinedDiscountResult {
  couponApplicable: boolean;
  couponDiscountCents: number;
  promotionApplicable: boolean;
  promotionDiscountCents: number;
  totalDiscountCents: number;
  totalCents: number | null;
  finalTotalCents: number | null;
}
function combineDiscounts(cart: Cart, coupon: Coupon | null, promotionRule: PromotionRule | null, discountProductUnitPriceCents: number | null, now: string): CombinedDiscountResult
```

## Invariants
- `totalCents` es el subtotal COMPLETO del carrito, calculado igual que
  `summarizeCart(cart).totalCents` de [cart-cart-summary](./cart-cart-summary.md)
  (`null` si algun item tiene `unitPriceCents: null`).
- La promocion se evalua SIEMPRE contra el carrito COMPLETO (sin filtrar),
  via `evaluatePromotion(cart, promotionRule, discountProductUnitPriceCents)`.
  `promotionApplicable` es su `applicable`; `promotionDiscountCents` es su
  `discountCents` si aplicable, o `0` si no.
- Para el cupon: si `promotionApplicable` es `true` Y `coupon !== null` Y
  `coupon.appliesToPromotionalItems === false`, se construye un carrito
  SINTETICO igual a `cart` pero SIN el item cuyo `productId ===
  promotionRule.discountProductId`, y se evalua el cupon contra ESE carrito
  filtrado. En cualquier otro caso (promocion no aplicable, sin cupon, o
  `appliesToPromotionalItems: true`), el cupon se evalua contra el carrito
  COMPLETO sin filtrar.
- `couponApplicable` es el `valid` de esa evaluacion; `couponDiscountCents`
  es su `discountCents` si valido, o `0` si no.
- `totalDiscountCents = couponDiscountCents + promotionDiscountCents`
  (ambos pueden coexistir, ninguno excluye al otro a nivel de MONTO -- solo
  el filtrado de ITEMS elegibles del cupon cambia segun el flag).
- `finalTotalCents`: `null` si `totalCents` es `null`; si no,
  `totalCents - totalDiscountCents`.
- NO muta `cart` (el carrito sintetico filtrado es una copia); nunca lanza.

## Examples
- Sin cupon ni promocion -> `{ couponApplicable: false,
  promotionApplicable: false, totalDiscountCents: 0, finalTotalCents:
  totalCents }`.
- Solo promocion (50% de un item de `5500`) -> `promotionDiscountCents:
  2750`, `couponApplicable: false`.
- Solo cupon (10% sobre `19300`) -> `couponDiscountCents: 1930`,
  `promotionApplicable: false`.
- Ambos, `appliesToPromotionalItems: true` -> `couponDiscountCents: 1930`
  (sobre el carrito COMPLETO) + `promotionDiscountCents: 2750` ->
  `totalDiscountCents: 4680`.
- Ambos, `appliesToPromotionalItems: false`, promocion sobre el item de
  `5500` (parte de un carrito de `19300`) -> el cupon se evalua sobre
  `19300 - 5500 = 13800` -> `couponDiscountCents: 1380` +
  `promotionDiscountCents: 2750` -> `totalDiscountCents: 4130`.
- `combinableWithCoupons: false` en la regla NO cambia el resultado si
  `appliesToPromotionalItems: true` en el cupon (el cupon gana).
- Promocion no aplicable (inactiva, o trigger ausente) -> el cupon SIEMPRE
  se evalua sobre el carrito completo, sin importar
  `appliesToPromotionalItems`.
- Item con `unitPriceCents: null` -> `totalCents: null`,
  `finalTotalCents: null`.

## Do / Don't
- DO: reusar `evaluateCoupon`/`evaluatePromotion` tal cual -- no
  reimplementar su logica de vigencia/elegibilidad/redondeo aca.
- DO: construir el carrito filtrado como una copia (`{ ...cart, items:
  cart.items.filter(...) }`), nunca mutar `cart.items` in place.
- DON'T: usar `promotionRule.combinableWithCoupons` para decidir nada --
  es campo de documentacion del admin, el cupon siempre tiene la ultima
  palabra (decision del usuario).
- DON'T: capear `totalDiscountCents` al `totalCents` (evitar un total
  negativo NO es responsabilidad de esta funcion -- cada evaluacion
  individual ya capea su propio descuento al subtotal que le corresponde).

## Tests
(Los tests estan en `src/agent/promotions/combine_discounts.test.ts`,
oraculo congelado con `node:test`, con un carrito fijo de 2 items en
memoria -- sin SQLite real, sin catalogo real.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/promotions/combine_discounts.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/promotions/combine_discounts.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
