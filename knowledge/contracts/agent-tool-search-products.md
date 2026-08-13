---
type: 'Task Contract'
title: 'Tool del agente: search_products'
description: 'Wrapper AgentTool sobre searchProducts, recibe el snapshot de productos por factory y expone {results} o {error} al modelo.'
tags: ['ccdd', 'agent', 'catalog', 'tool']
language: typescript

task: agent_tool_search_products
intent: "Exponer searchProducts como tool del agente."
target: src/agent/tools/search_products.ts
signature: "function searchProductsTool(products: DbProduct[]): AgentTool"
test_command: "node --test src/agent/tools/search_products.test.ts"
budget:
  cyclomatic_max: 4
  nesting_max: 2
tests: "src/agent/tools/search_products.test.ts"
tests_sha256: "49b37d2c6cdb946c680395fb24bf29e31fc2687a674d6d90053d71722a11feaa"
touch_only: ['src/agent/tools/search_products.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente search_products

## Intent
Puente entre [catalog-search-products](./catalog-search-products.md) (funcion pura) y
el modelo: declara el JSON schema que ve el LLM y valida el input antes de llamar a
`searchProducts`. Sigue el mismo patron que
[agent-tool-calculate](./agent-tool-calculate.md): factory sin I/O propio, recibe el
snapshot de productos ya cargado (quien arma la tool decide de donde sale ese
snapshot — `main.ts`, no contractado, hace `db.listProducts()` una vez al arrancar).

## Interface
```typescript
function searchProductsTool(products: DbProduct[]): AgentTool
```

## Invariants
- `name` es siempre `"search_products"`; `parameters` exige `query: string`
  (`required`, `additionalProperties: false`).
- `execute({ query })` con `query` no-string devuelve
  `{ error: "query must be a string" }`, nunca lanza.
- `execute({ query })` con `query` valida devuelve `{ results: SearchResult[] }`
  (puede ser `[]` si nada matchea) — delega el ranking entero a
  `searchProducts`, no reimplementa logica de busqueda.

## Examples
- `searchProductsTool(catalog).execute({ query: "yoga" })` -> 
  `{ results: [{ id, sku, name, priceCents, categories }, ...] }`.
- `searchProductsTool(catalog).execute({ query: "nonexistent" })` -> `{ results: [] }`.
- `searchProductsTool(catalog).execute({ query: 5 })` -> 
  `{ error: "query must be a string" }`.

## Do / Don't
- DO: delegar el ranking completo a `searchProducts` — este archivo es solo
  validacion de input + shape de tool.
- DON'T: tocar SQLite/`CatalogDb` aca — el snapshot ya llega armado.

## Tests
(Los tests estan en `src/agent/tools/search_products.test.ts`, oraculo congelado
con `node:test`, catalogo fijo de 2 productos en memoria.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/search_products.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/search_products.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
