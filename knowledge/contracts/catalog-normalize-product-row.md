---
type: 'Task Contract'
title: 'Normalizador de filas WooCommerce'
description: 'Convierte una fila CSV cruda de WooCommerce (CsvRow) en un NormalizedRow: tipo validado, precio a centavos, categorias/imagenes/atributos parseados.'
tags: ['ccdd', 'catalog', 'normalization']
language: typescript

task: catalog_normalize_product_row
intent: "Normalizar una fila CSV de WooCommerce a un producto validado."
target: src/agent/catalog/normalize_product_row.ts
signature: "function normalizeProductRow(row: CsvRow): NormalizedRow"
test_command: "node --test src/agent/catalog/normalize_product_row.test.ts"
budget:
  cyclomatic_max: 14
  nesting_max: 3
tests: "src/agent/catalog/normalize_product_row.test.ts"
tests_sha256: "0baabe33572d0b1207c041ca20342bfb82a1259c7b49ea40c8e44b9c7f9a07af"
touch_only: ['src/agent/catalog/normalize_product_row.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Normalizador de filas WooCommerce

## Intent
Puente entre [parse-woocommerce-csv](./catalog-parse-woocommerce-csv.md) (texto crudo
-> `CsvRow`) y [catalog-db](./catalog-catalog-db.md) (persistencia). Opera sobre UNA fila
a la vez, sin ver el resto del CSV — por eso NO resuelve la columna `Parent` (que en el CSV
real de WooCommerce es el SKU del padre, no su id numerico) a un `parentId` real: eso exige
ver el CSV completo para construir un mapa SKU->id, y es responsabilidad de
[catalog-import-catalog.md](./catalog-import-catalog.md) (aun no escrito), que llama a esta
funcion por cada fila y despues resuelve `parentSku` a `parentId`.

## Interface
```typescript
export interface NormalizedRow {
  id: string;
  sku: string;
  name: string;
  type: "simple" | "variable" | "variation";
  description: string;
  priceCents: number | null;
  categories: string[];
  images: string[];
  parentSku: string | null;
  attributes: Array<{ name: string; value: string }>;
}
function normalizeProductRow(row: CsvRow): NormalizedRow
```

## Invariants
- `type` debe ser exactamente `"simple"`, `"variable"` o `"variation"` (columna `Type` del
  CSV); cualquier otro valor lanza `Error: unrecognized product type: <valor>` — nunca se
  adivina ni se descarta en silencio.
- `priceCents` usa la columna `Sale price` si tiene contenido; si esta vacia, usa
  `Regular price`; si ambas estan vacias, es `null`. La conversion de string decimal
  ("19.99") a centavos enteros nunca pasa por aritmetica de punto flotante que pueda
  arrastrar error (ver issue #7: precios SIEMPRE enteros).
- `categories` e `images` son el resultado de partir las columnas `Categories`/`Images` por
  coma, recortando espacios y descartando entradas vacias; un campo en blanco da `[]`.
- `parentSku` es el valor crudo (recortado) de la columna `Parent`, o `null` si esta vacia.
  Es un SKU, NO un id — el nombre del campo lo deja explicito.
- `attributes` recolecta unicamente los pares `Attribute N name`/`Attribute N value(s)`
  (N: 1..5) donde el nombre no esta vacio, preservando el `value(s)` como string crudo
  (sin partir por `|` — esa interpretacion es de quien consuma variaciones despues).

## Examples
- Fila `Type=simple, "Regular price"=19.99` -> `priceCents: 1999`.
- Fila con `"Sale price"=15` y `"Regular price"=19.99` -> `priceCents: 1500` (gana Sale price).
- Fila `Type=variable` sin ningun precio -> `priceCents: null`.
- Fila `Type=variation, Parent=MH01` -> `parentSku: "MH01"`.
- Fila `Type=grouped` -> lanza `Error: unrecognized product type: grouped`.

## Do / Don't
- DO: convertir precio a centavos con aritmetica de enteros (parsear parte entera y
  decimal del string por separado), no `Math.round(parseFloat(x) * 100)` a ciegas.
- DON'T: intentar resolver `parentSku` a un `id` real aca — no hay forma de hacerlo viendo
  una sola fila.

## Tests
(Los tests estan en `src/agent/catalog/normalize_product_row.test.ts`, oraculo congelado con
`node:test`: mapeo simple, precio con sale/regular, precio ausente, conversion sin drift,
parentSku presente/ausente, categorias/imagenes con espacios y vacios, atributos parciales,
tipo desconocido.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/catalog/normalize_product_row.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/catalog/normalize_product_row.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
