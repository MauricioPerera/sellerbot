---
type: 'Task Contract'
title: 'Tool del agente: get_product_detail'
description: 'Wrapper AgentTool sobre getProductDetail, recibe el snapshot de productos por factory y expone el detalle o {error} al modelo.'
tags: ['ccdd', 'agent', 'catalog', 'tool']
language: typescript

task: agent_tool_get_product_detail
intent: "Exponer getProductDetail como tool del agente."
target: src/agent/tools/get_product_detail.ts
signature: "function getProductDetailTool(products: DbProduct[]): AgentTool"
test_command: "node --test src/agent/tools/get_product_detail.test.ts"
budget:
  cyclomatic_max: 4
  nesting_max: 2
tests: "src/agent/tools/get_product_detail.test.ts"
tests_sha256: "8ba861bd577a7cfa8d005e039ac034d508f41e2d942b13b2241494b31e415ebf"
touch_only: ['src/agent/tools/get_product_detail.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente get_product_detail

## Intent
Puente entre [catalog-get-product-detail](./catalog-get-product-detail.md) (funcion
pura) y el modelo. El modelo llama esta tool con el `id` que ya vio en un resultado
previo de `search_products` (issue #2: "que talles tiene la segunda?" — el modelo
resuelve el ordinal contra su propio historial de mensajes, no hace falta trackear
contexto de conversacion aparte). Mismo patron factory que
[agent-tool-search-products](./agent-tool-search-products.md).

## Interface
```typescript
function getProductDetailTool(products: DbProduct[]): AgentTool
```

## Invariants
- `name` es siempre `"get_product_detail"`; `parameters` exige
  `product_id: string` (`required`, `additionalProperties: false`).
- `execute({ product_id })` con `product_id` no-string devuelve
  `{ error: "product_id must be a string" }`, nunca lanza.
- `execute({ product_id })` con un id que no existe devuelve
  `{ error: "no product found with id <product_id>" }`.
- `execute({ product_id })` con un id valido devuelve el `ProductDetail` completo
  (`{ product, variations }`) tal cual lo arma `getProductDetail` — sin
  reformatear ni resumir.

## Examples
- `getProductDetailTool(catalog).execute({ product_id: "17" })` -> 
  `{ product: {...}, variations: [...] }`.
- `getProductDetailTool(catalog).execute({ product_id: "missing" })` -> 
  `{ error: "no product found with id missing" }`.
- `getProductDetailTool(catalog).execute({ product_id: 5 })` -> 
  `{ error: "product_id must be a string" }`.

## Do / Don't
- DO: devolver el resultado de `getProductDetail` tal cual (el modelo decide que
  mostrar al usuario).
- DON'T: tocar SQLite/`CatalogDb` aca — el snapshot ya llega armado.

## Tests
(Los tests estan en `src/agent/tools/get_product_detail.test.ts`, oraculo congelado
con `node:test`, catalogo fijo de 2 productos (un padre + su variacion) en memoria.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/get_product_detail.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/get_product_detail.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
