---
type: 'Task Contract'
title: 'Detalle de producto con sus variaciones'
description: 'Busca un producto por id en DbProduct[] y junta sus variaciones (hijas por parentId), ordenadas por sku.'
tags: ['ccdd', 'catalog', 'detail']
language: typescript

task: catalog_get_product_detail
intent: "Recuperar el detalle completo de un producto por id."
target: src/agent/catalog/get_product_detail.ts
signature: "function getProductDetail(products: DbProduct[], id: string): ProductDetail | null"
test_command: "node --test src/agent/catalog/get_product_detail.test.ts"
budget:
  cyclomatic_max: 6
  nesting_max: 2
tests: "src/agent/catalog/get_product_detail.test.ts"
tests_sha256: "ae7c4cad3c6c7a6965ee6ec98abfa95d7d17135bb68588985d6762cf40999e9e"
touch_only: ['src/agent/catalog/get_product_detail.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Detalle de producto con sus variaciones

## Intent
Cuando el usuario pide detalle de un producto (issue #2: "¿que talles tiene la
segunda?"), el agente necesita el producto Y sus variaciones juntas. Igual que
[catalog-search-products](./catalog-search-products.md), es una funcion pura sobre
`DbProduct[]` (la lista que trae `listProducts()`, [catalog-db](./catalog-catalog-db.md)) —
sin tocar SQLite directamente.

## Interface
```typescript
export interface ProductDetail {
  product: DbProduct;
  variations: DbProduct[];
}
function getProductDetail(products: DbProduct[], id: string): ProductDetail | null
```

## Invariants
- Busca en `products` el elemento cuyo `id` matchea exactamente; si no existe,
  devuelve `null` (nunca lanza).
- `variations` es el subconjunto de `products` con `type === "variation"` y
  `parentId === id` (el id BUSCADO, no el id de cada variacion) — ordenado por
  `sku` ascendente para que el resultado sea determinista.
- Si `id` corresponde a un producto sin hijos (`simple`, o una `variation` en si
  misma — las variaciones no tienen sub-variaciones), `variations` es `[]`.
- Nunca mezcla variaciones de un `parentId` distinto al buscado.

## Examples
- `getProductDetail(all, "missing")` -> `null`.
- `getProductDetail(all, "17")` con dos variaciones (`parentId: "17"`) -> 
  `{ product: <el de id 17>, variations: [<ambas>, ordenadas por sku] }`.
- `getProductDetail(all, "20")` sobre un producto `simple` sin hijos -> 
  `{ product: <ese>, variations: [] }`.

## Do / Don't
- DO: ordenar `variations` por `sku` para que el oraculo (y cualquier consumidor)
  tenga un orden estable.
- DON'T: tocar `CatalogDb`/SQLite aca — recibe el array ya materializado.

## Tests
(Los tests estan en `src/agent/catalog/get_product_detail.test.ts`, oraculo
congelado con `node:test`, con un catalogo fijo de 5 productos (dos padres, sus
variaciones) en memoria.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/catalog/get_product_detail.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/catalog/get_product_detail.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
