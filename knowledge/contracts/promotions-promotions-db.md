---
type: 'Task Contract'
title: 'Almacen SQLite de reglas de promocion vinculada (CRUD administrable)'
description: 'Persiste reglas de promocion vinculada entre productos (trigger -> descuento) con CRUD completo para el panel administrativo: crear, leer, listar, activar/desactivar y borrar.'
tags: ['ccdd', 'promotions', 'sqlite', 'admin']
language: typescript

task: promotions_promotions_db
intent: "Persistir reglas de promocion vinculada administrables por CRUD."
target: src/agent/promotions/promotions_db.ts
signature: "function openPromotionsDb(location: string): PromotionsDb"
test_command: "node --test src/agent/promotions/promotions_db.test.ts"
budget:
  cyclomatic_max: 16
  nesting_max: 4
tests: "src/agent/promotions/promotions_db.test.ts"
tests_sha256: "cc63085e6c317f5d795028658865186bd929035075fa529c2e7164e6581387e9"
touch_only: ['src/agent/promotions/promotions_db.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Almacen SQLite de reglas de promocion vinculada

## Intent
Issue #9 ("Promociones vinculadas entre productos"): "un panel de
administracion donde se puedan definir reglas deterministas de cuando se
aplica una promocion" -- decision explicita del usuario. A diferencia de
`coupons_data.ts` (dataset dummy hardcodeado en codigo), las reglas de
promocion son administrables en runtime: el admin las crea/edita/desactiva
desde el panel (batch D de este issue), por eso necesitan persistencia con
CRUD real, no un array estatico.

Cada regla vincula un producto "trigger" (el que dispara la sugerencia) con
un producto "descuento" (el que se ofrece con descuento) -- ver
[promotions-evaluate-promotion](./promotions-evaluate-promotion.md) para
como se EVALUA una regla contra un carrito; este contrato solo la persiste.
`combinableWithCoupons` es el flag de intent del admin sobre si esta
promocion deberia combinarse con un cupon -- se guarda aca pero la funcion
que combina cupon+promocion (batch posterior) le da prioridad al flag del
propio cupon si contradicen (decision del usuario), asi que este campo
queda principalmente como documentacion de la intencion del admin.

Mismo patron `node:sqlite` que `orders_db.ts`/`cart_db.ts`.

## Interface
```typescript
import type { PromotionRule } from "./evaluate_promotion.ts";
export interface Promotion extends PromotionRule {
  id: string;
  createdAt: string;
  updatedAt: string;
}
export interface CreatePromotionInput {
  triggerProductId: string;
  discountProductId: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  combinableWithCoupons: boolean;
}
export interface PromotionsDb {
  createPromotion(input: CreatePromotionInput): Promotion;
  getPromotion(id: string): Promotion | null;
  listPromotions(): Promotion[];
  setActive(id: string, active: boolean): Promotion;
  deletePromotion(id: string): void;
  close(): void;
}
function openPromotionsDb(location: string): PromotionsDb
```

## Invariants
- `createPromotion(input)` genera un `id` nuevo (string unico, ej.
  `crypto.randomUUID()`), copia los 5 campos de `input` tal cual, fija
  `active: true` SIEMPRE (una promocion recien creada arranca activa; para
  crearla desactivada, el admin la crea y despues llama `setActive(id,
  false)`), y estampa `createdAt`/`updatedAt` con la hora real
  (`new Date().toISOString()`) en el momento de la creacion.
- `getPromotion(id)` devuelve `null` si no existe, nunca lanza.
- `listPromotions()` devuelve TODAS las reglas (activas E inactivas -- el
  panel admin necesita ver y reactivar una desactivada), ordenadas por
  `createdAt` DESCENDENTE (la mas nueva primero); `[]` si no hay ninguna.
- `setActive(id, active)`:
  - LANZA si `id` no existe.
  - Actualiza `active` al valor pasado (funciona igual si el valor nuevo es
    igual al actual -- no valida transicion, a diferencia de
    `adminTransition` de `orders_db.ts`) y estampa `updatedAt`.
  - Devuelve la `Promotion` ya actualizada.
- `deletePromotion(id)`:
  - Si `id` existe, borra la fila.
  - Si `id` NO existe, es un no-op silencioso -- NO lanza (idempotente,
    igual criterio que un DELETE de REST: "asegurate de que ya no este", no
    "fallar si ya no estaba").
- Reabrir el mismo archivo preserva las promociones ya guardadas (mismo
  patron de sobrevivir un reinicio que `orders_db.ts`/`catalog_db.ts`).
- `close()` libera el handle; no se usa el `PromotionsDb` despues.

## Examples
- `createPromotion({ triggerProductId: "145", discountProductId: "193",
  discountType: "percentage", discountValue: 50, combinableWithCoupons: true
  })` -> `Promotion` con `id` generado, `active: true`.
- `getPromotion("missing")` -> `null`.
- `listPromotions()` en una base vacia -> `[]`.
- Crear 2 promociones, `listPromotions()` -> ambas, la mas nueva primero.
- `setActive(id, false)` -> `Promotion` con `active: false`; sigue apareciendo
  en `listPromotions()`.
- `setActive("missing", false)` -> lanza.
- `deletePromotion(id)` -> `getPromotion(id)` pasa a devolver `null`.
- `deletePromotion("missing")` -> no lanza (idempotente).

## Do / Don't
- DO: usar `node:sqlite` (`DatabaseSync`) del core de Node, sin dependencia
  npm.
- DO: `active: true` fijo en `createPromotion`, sin importar si `input`
  tuviera un campo `active` (no lo tiene -- `CreatePromotionInput` no
  incluye `active` a proposito).
- DON'T: implementar aca la logica de evaluacion (si la regla aplica a un
  carrito) -- eso es `evaluate_promotion.ts`.
- DON'T: implementar aca la resolucion de conflicto
  `combinableWithCoupons`/`appliesToPromotionalItems` -- se guarda el campo,
  no se interpreta.
- DON'T: validar que `triggerProductId`/`discountProductId` existan en el
  catalogo -- responsabilidad de la capa que llama (tool/admin API).

## Tests
(Los tests estan en `src/agent/promotions/promotions_db.test.ts`, oraculo
congelado con `node:test`, usando `:memory:` para los casos deterministas y
un archivo temporal real para el caso de reinicio.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/promotions/promotions_db.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/promotions/promotions_db.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
