---
type: 'Task Contract'
title: 'Motor puro: promociones vinculadas aplicables a un carrito'
description: 'Filtra y evalua reglas de promocion contra un carrito y un catalogo, devolviendo la lista de promociones vinculadas realmente aplicables -- sin leer ni escribir ninguna base de datos.'
tags: ['ccdd', 'promotions', 'cart']
language: typescript

task: promotions_find_applicable_promotions
intent: "Calcular que promociones vinculadas activas aplican a un carrito dado."
target: src/agent/promotions/find_applicable_promotions.ts
signature: "function findApplicablePromotions(cart: Cart | null, promotions: Promotion[], catalog: DbProduct[]): ApplicablePromotion[]"
test_command: "node --test src/agent/promotions/find_applicable_promotions.test.ts"
budget:
  cyclomatic_max: 10
  nesting_max: 3
tests: "src/agent/promotions/find_applicable_promotions.test.ts"
tests_sha256: "79a0828e0dba2386362069b1c018d2481fe69f814c98989dc08f5d9faa9bac53"
touch_only: ['src/agent/promotions/find_applicable_promotions.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Motor puro de promociones vinculadas aplicables

## Intent
Extraido de [agent-tool-check-promotions](./agent-tool-check-promotions.md):
esa tool ya calculaba "que promociones activas aplican al carrito actual"
como logica inline, mezclada con la lectura de `cartDb`/`promotionsDb`. Se
extrae a una funcion PURA para poder reutilizar exactamente el mismo calculo
desde [agent-tool-add-to-cart](./agent-tool-add-to-cart.md) (issue: el LLM no
siempre llamaba `check_promotions` despues de `add_to_cart` pese a la
instruccion del system prompt -- la sugerencia de promocion ahora viaja en la
propia respuesta de `add_to_cart`, sin depender de que el modelo recuerde
hacer una segunda llamada). `check_promotions.ts` sigue siendo la tool
expuesta al LLM para re-consultar bajo demanda; ambos pueden delegar a esta
funcion.

## Interface
```typescript
export interface ApplicablePromotion {
  promotion_id: string;
  discount_product_id: string;
  discount_product_name: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  discount_cents: number;
}

function findApplicablePromotions(
  cart: Cart | null,
  promotions: Promotion[],
  catalog: DbProduct[],
): ApplicablePromotion[]
```

## Invariants
- `cart === null` o `cart.items.length === 0` -> `[]`.
- Solo se consideran promociones con `active === true`.
- De esas, solo las que tienen `triggerProductId` presente en `cart.items`
  (algun item con ese `productId`).
- Para cada una, resuelve el producto de descuento en `catalog` por
  `discountProductId`; si no aparece, se EXCLUYE (no se puede sugerir un
  descuento sobre un producto sin precio/nombre resuelto).
- Evalua con `evaluatePromotion(cart, rule, product.priceCents)`; si
  `applicable` es `false`, se EXCLUYE.
- Cada entrada incluye `promotion_id` (el `id` de la `Promotion`),
  `discount_product_id`, `discount_product_name` (de `catalog`),
  `discount_type`/`discount_value` (los de la regla, tal cual), y
  `discount_cents` (el `discountCents` de la evaluacion).
- El orden del resultado sigue el orden del array `promotions` recibido,
  filtrado (esta funcion no ordena ni pagina).
- Nunca lanza; no lee ni escribe ninguna base de datos (funcion pura).

## Examples
- `findApplicablePromotions(null, [...], catalog)` -> `[]`.
- Carrito con item `"145"` (trigger de una regla activa hacia `"193"` al
  50%, `"193"` con precio `5500` en catalogo) -> `[{ promotion_id: "...",
  discount_product_id: "193", discount_product_name: "Ajax Full-Zip
  Sweatshirt", discount_type: "percentage", discount_value: 50,
  discount_cents: 2750 }]`.
- Misma regla pero `active: false` -> `[]`.
- Carrito sin el producto trigger -> `[]`.
- Regla cuyo `discountProductId` no esta en `catalog` -> excluida.
- Dos reglas aplicables -> ambas en el resultado, en el orden recibido.

## Do / Don't
- DO: usar `evaluatePromotion` (`evaluate_promotion.ts`) para el calculo del
  descuento -- no reimplementar porcentaje/fijo aca.
- DO: mantener la funcion pura (solo `cart`, `promotions`, `catalog` como
  entrada, sin leer `PromotionsDb`/`CartDb` directamente) para que sea
  reutilizable desde cualquier tool sin duplicar logica de I/O.
- DON'T: filtrar/ordenar por fecha de creacion aca -- quien llama decide el
  orden en que pasa el array `promotions` (ej. `listPromotions()` ya lo
  devuelve mas reciente primero).
- DON'T: aplicar nada ni tocar ninguna base de datos -- esto es solo
  calculo.

## Tests
(Los tests estan en `src/agent/promotions/find_applicable_promotions.test.ts`,
oraculo congelado con `node:test`, con carritos/catalogo/promociones fijos en
memoria -- sin red, sin SQLite.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/promotions/find_applicable_promotions.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/promotions/find_applicable_promotions.test.ts`
      sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
