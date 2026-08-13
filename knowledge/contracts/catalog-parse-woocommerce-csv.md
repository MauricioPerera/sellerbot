---
type: 'Task Contract'
title: 'Parser CSV de WooCommerce (sample data)'
description: 'Parser CSV a mano (RFC4180: comillas, comas/newlines embebidos, doble-comilla escapada) para el export de productos de WooCommerce, sin dependencias externas.'
tags: ['ccdd', 'catalog', 'csv']
language: typescript

task: catalog_parse_woocommerce_csv
intent: "Parsear un CSV de productos de WooCommerce a filas indexadas por columna de header."
target: src/agent/catalog/parse_woocommerce_csv.ts
signature: "function parseWooCommerceCsv(csvText: string): CsvRow[]"
test_command: "node --test src/agent/catalog/parse_woocommerce_csv.test.ts"
budget:
  cyclomatic_max: 12
  nesting_max: 3
tests: "src/agent/catalog/parse_woocommerce_csv.test.ts"
tests_sha256: "4f581b68c645582a28aa5199a01c8ec1e758341489efa228ab4435def30bfa94"
touch_only: ['src/agent/catalog/parse_woocommerce_csv.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Parser CSV de WooCommerce

## Intent
El catalogo dummy de sellerbot (issue #2) viene como
`woocommerce-sample-data.csv` (formato estandar de export de productos de
WooCommerce, ~2037 filas). No es CSV trivial: tiene HTML embebido en
`description`, comas dentro de campos entre comillas (ej. `Categories`),
y valores multi-atributo separados por `|`. `.split(',')` corrompe estos
datos. Este contrato es el parser generico RFC4180 (sin dependencias, sin
`eval`) que resuelve eso — la normalizacion especifica de WooCommerce
(tipos, precios, atributos) es otro contrato
(`catalog-normalize-product-row.md`, aun no escrito).

## Interface
```typescript
export type CsvRow = Record<string, string>;
function parseWooCommerceCsv(csvText: string): CsvRow[]
```

## Invariants
- La primera linea es el header: sus valores (sin comillas) son las
  claves de cada objeto de fila.
- Un campo entre comillas dobles (`"..."`) puede contener comas, saltos
  de linea, y comillas dobles escapadas como `""` (que se des-escapan a
  `"` en el valor final).
- Soporta terminadores de linea `\n` y `\r\n` indistintamente.
- Una linea completamente vacia al final del archivo se ignora (no genera
  una fila fantasma).
- Todos los valores devueltos son `string` (sin coercion de tipos:
  numeros, booleanos, listas separadas por `|` quedan como texto crudo;
  esa interpretacion es responsabilidad de un contrato posterior).
- Un CSV de solo header (sin filas de datos) devuelve `[]`.

## Examples
- `"ID,Name\n17,Hoodie\n"` -> `[{ ID: "17", Name: "Hoodie" }]`.
- `'ID,Categories\n17,"Clothing>Men,Clothing"\n'` -> el valor de
  `Categories` es `"Clothing>Men,Clothing"` completo (la coma interna no
  parte el campo).
- `'ID,Name\n17,"He said ""hi"""\n'` -> `Name` es `He said "hi"`.
- `"ID,Name\n"` -> `[]`.

## Do / Don't
- DO: implementar un parser caracter-por-caracter (maquina de estados:
  dentro/fuera de comillas), sin regex fragil ni `.split(',')`.
- DON'T: usar ninguna dependencia npm de parsing CSV (`deps_allowed: []`)
  ni `eval`/`Function` para nada.

## Tests
(Los tests estan en `src/agent/catalog/parse_woocommerce_csv.test.ts`,
oraculo congelado con `node:test`, con los casos reales que aparecen en
el CSV de WooCommerce: comillas, comas embebidas, HTML, CRLF, filas
multiples, linea vacia final.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/catalog/parse_woocommerce_csv.ts`.
- PARAR y reportar si necesitas conectarte a la red.
- PARAR y reportar si el CSV real de WooCommerce tiene un caso que el
  oraculo no cubre y no podes resolverlo sin ambiguedad — documentalo en
  vez de adivinar.

## Criterios de aceptacion
- [ ] `node --test src/agent/catalog/parse_woocommerce_csv.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
