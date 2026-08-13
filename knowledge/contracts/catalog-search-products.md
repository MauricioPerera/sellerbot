---
type: 'Task Contract'
title: 'Busqueda de productos por keyword (determinista)'
description: 'Rankea productos por superposicion de tokens de la query contra nombre/descripcion/categorias, sin ML, excluyendo variaciones.'
tags: ['ccdd', 'catalog', 'search']
language: typescript

task: catalog_search_products
intent: "Rankear productos por coincidencia de tokens contra una query de busqueda."
target: src/agent/catalog/search_products.ts
signature: "function searchProducts(products: DbProduct[], query: string, limit?: number): SearchResult[]"
test_command: "node --test src/agent/catalog/search_products.test.ts"
budget:
  cyclomatic_max: 10
  nesting_max: 3
tests: "src/agent/catalog/search_products.test.ts"
tests_sha256: "1b92e2f974144b2153a7c7864414e720153e4e96cdba84277cc048d82b984c90"
touch_only: ['src/agent/catalog/search_products.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Busqueda de productos por keyword

## Intent
Issue #2 exige que el agente busque productos sin inventar resultados ni mostrar el
catalogo completo. Esta es la pieza determinista (sin ML/embeddings) que rankea
`DbProduct[]` (la lista completa que devuelve `listProducts()`,
[catalog-db](./catalog-catalog-db.md)) contra una query en lenguaje natural, por
superposicion de tokens — cero llamadas a modelo, cero azar.

## Interface
```typescript
export interface SearchResult {
  id: string;
  sku: string;
  name: string;
  priceCents: number | null;
  categories: string[];
}
function searchProducts(products: DbProduct[], query: string, limit?: number): SearchResult[]
```

## Invariants
- Tokeniza `query` y el texto buscable de cada producto (`name` + `description` +
  `categories` unidos) en minusculas, separando por cualquier caracter no
  alfanumerico (`/[^a-z0-9]+/`), descartando tokens vacios.
- El "score" de un producto es la cantidad de tokens DISTINTOS de la query presentes
  en el set de tokens del producto (no cuenta repeticiones).
- Excluye SIEMPRE productos con `type === "variation"` del resultado — una
  variacion no es un resultado de busqueda independiente, se llega a ella via
  [catalog-get-product-detail](./catalog-get-product-detail.md).
- Excluye productos con score `0` (ningun token de la query matcheo).
- Ordena por score descendente; empate se rompe por `name` ascendente
  (comparacion de string estandar).
- `limit` (default `5`) acota la cantidad de resultados devueltos, aplicado DESPUES
  de ordenar.
- Sobre `products: []` o sin ningun match, devuelve `[]`. Nunca lanza.
- El match es por TOKEN exacto, no substring — `"hood"` no matchea `"hoodie"`.

## Examples
- `searchProducts([], "hoodie")` -> `[]`.
- Tres productos con "hoodie" en el nombre (uno con tambien "winter" en la
  descripcion) y query `"winter hoodie"` -> el que matchea ambos tokens aparece
  primero (score 2), los otros dos (score 1) despues, ordenados por nombre.
- Un producto `type: "variation"` cuyo nombre contiene el termino buscado nunca
  aparece en los resultados.
- `searchProducts(all, "hoodie", 2)` -> a lo sumo 2 resultados, los de mayor score.

## Do / Don't
- DO: tokenizar con una regex simple y `Set` para el score (sin librerias de
  fuzzy-search ni dependencias nuevas).
- DON'T: usar `includes`/substring para matchear tokens — debe ser comparacion de
  token completo.
- DON'T: tocar SQLite o `CatalogDb` desde aca — la funcion es pura, opera sobre el
  array que ya trajo quien la llama.

## Tests
(Los tests estan en `src/agent/catalog/search_products.test.ts`, oraculo congelado
con `node:test`, con un catalogo fijo de 5 productos en memoria — sin red, sin
SQLite real.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/catalog/search_products.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/catalog/search_products.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
