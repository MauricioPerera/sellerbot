---
type: 'Task Contract'
title: 'Orquestador de import del catalogo (idempotente)'
description: 'Parsea CSV, normaliza cada fila, resuelve parentSku a parentId real via mapa SKU->id, e inserta idempotentemente en CatalogDb.'
tags: ['ccdd', 'catalog', 'import']
language: typescript

task: catalog_import_catalog
intent: "Cargar un CSV de WooCommerce en un CatalogDb de forma idempotente."
target: src/agent/catalog/import_catalog.ts
signature: "function importCatalog(csvText: string, db: CatalogDb): ImportResult"
test_command: "node --test src/agent/catalog/import_catalog.test.ts"
budget:
  cyclomatic_max: 12
  nesting_max: 3
tests: "src/agent/catalog/import_catalog.test.ts"
tests_sha256: "2ca6f04e742529788e11dec58ddd9da0aa02f8833d9798268604553d9b55a0de"
touch_only: ['src/agent/catalog/import_catalog.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Orquestador de import del catalogo

## Intent
Ultima pieza del pipeline de import (issue #7):
[parse-woocommerce-csv](./catalog-parse-woocommerce-csv.md) ->
[normalize-product-row](./catalog-normalize-product-row.md) -> este contrato ->
[catalog-db](./catalog-catalog-db.md). Es el UNICO lugar del pipeline que ve el CSV
completo, por eso es el UNICO que puede resolver `parentSku` (el SKU crudo de la columna
`Parent`) al `parentId` real (el `id` numerico del producto padre en `CatalogDb`) — arma un
mapa `sku -> id` con todas las filas antes de insertar. Tambien es el unico lugar que puede
garantizar idempotencia (correr el import dos veces no duplica), porque es quien decide,
fila por fila, si ya existe antes de insertar.

## Interface
```typescript
export interface ImportResult {
  total: number;
  inserted: number;
  skipped: number;
}
function importCatalog(csvText: string, db: CatalogDb): ImportResult
```

## Invariants
- Parsea `csvText` con `parseWooCommerceCsv`, normaliza cada fila con
  `normalizeProductRow`, y arma un mapa `sku -> id` recorriendo TODAS las filas normalizadas
  antes de insertar ninguna (necesario porque una variacion puede aparecer antes que su
  padre en el CSV).
- Para cada fila, `parentId` se resuelve buscando `parentSku` en ese mapa; si `parentSku` es
  `null` o no matchea ningun `sku` del propio CSV, `parentId` queda `null` (no lanza —  un
  huerfano de datos dummy no es un error fatal).
- Idempotencia: antes de insertar una fila, consulta `db.getProductById(id)`; si ya existe,
  la cuenta en `skipped` y NO la inserta de nuevo (evita el throw por id duplicado de
  `catalog_db.ts`); si no existe, la inserta y la cuenta en `inserted`.
- `total` es siempre `inserted + skipped` y es igual a la cantidad de filas normalizadas.
- Si `normalizeProductRow` lanza (tipo de producto desconocido), `importCatalog` deja
  propagar la excepcion — no se auto-descartan filas invalidas en silencio.

## Examples
- CSV con un producto `variable` (sin `Parent`) y una `variation` con `Parent` = SKU del
  primero -> ambos se insertan, `variation.parentId` es el `id` real del `variable`.
- Correr `importCatalog` dos veces con el mismo `db` y el mismo CSV -> primera vez
  `{inserted: N, skipped: 0}`, segunda vez `{inserted: 0, skipped: N}`, sin lanzar.
- Una `variation` con `Parent` que no matchea ningun SKU del CSV -> se inserta igual, con
  `parentId: null`.
- Una fila con `Type` no reconocido -> `importCatalog` lanza (propaga el error de
  `normalizeProductRow`).

## Do / Don't
- DO: dos pasadas sobre las filas normalizadas (una para el mapa sku->id, otra para
  insertar) — resolver `parentSku` en la misma pasada que inserta puede fallar si el padre
  aparece despues en el CSV.
- DON'T: capturar y descartar errores de `normalizeProductRow` — un tipo de producto
  desconocido debe frenar el import, no ocultarse.

## Tests
(Los tests estan en `src/agent/catalog/import_catalog.test.ts`, oraculo congelado con
`node:test`, usando `openCatalogDb(":memory:")` real y CSVs pequenos inline: import basico
con relacion padre-hijo, doble corrida idempotente, huerfano sin parent match, producto sin
precio, tipo desconocido.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/catalog/import_catalog.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/catalog/import_catalog.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
