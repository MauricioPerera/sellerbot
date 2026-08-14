---
type: 'Task Contract'
title: 'Tool del agente: view_cart'
description: 'Wrapper AgentTool que devuelve el resumen actual del carrito de la conversacion (items, subtotales, total).'
tags: ['ccdd', 'agent', 'cart', 'tool']
language: typescript

task: agent_tool_view_cart
intent: "Exponer summarizeCart como tool del agente."
target: src/agent/tools/view_cart.ts
signature: "function viewCartTool(cartDb: CartDb, conversationId: string): AgentTool"
test_command: "node --test src/agent/tools/view_cart.test.ts"
budget:
  cyclomatic_max: 4
  nesting_max: 2
tests: "src/agent/tools/view_cart.test.ts"
tests_sha256: "73fc3916dba0bd630fecc6dfa200f9f0c2f12b787c519a26cae54b01689cff4b"
touch_only: ['src/agent/tools/view_cart.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool del agente view_cart

## Intent
Issue #4: "cuando el usuario pregunte '¿que tengo en el carrito?', el agente
muestra un resumen claro con items, cantidades, subtotal y cualquier dato
pendiente". Puente de solo lectura entre [cart-cart-db](./cart-cart-db.md) y
[cart-cart-summary](./cart-cart-summary.md) -- a diferencia de las otras 3
tools del carrito, esta no tiene efecto secundario (no llama `saveCart`).

## Interface
```typescript
function viewCartTool(cartDb: CartDb, conversationId: string): AgentTool
```

## Invariants
- `name` es siempre `"view_cart"`; `parameters` no exige ningun argumento
  (`required: []`, `additionalProperties: false`) -- el `conversationId` ya
  esta fijado por closure al construir la tool, no lo decide el modelo.
- `execute({})` lee el carrito via `cartDb.getCart(conversationId)`; si es
  `null` (conversacion sin carrito todavia), se trata como un carrito vacio
  (`{ items: [], totalCents: 0 }`) sin escribir nada en la base.
- Devuelve el resultado de `summarizeCart` tal cual (`{ items, totalCents }`),
  sin envolver en otro objeto ni reformatear moneda.
- Nunca lanza.

## Examples
- Conversacion sin carrito -> `execute({})` -> `{ items: [], totalCents: 0 }`.
- Carrito con dos items -> `execute({})` -> el mismo shape que devuelve
  `summarizeCart` (subtotal por item + total).
- Dos `conversationId` distintos con carritos distintos -> cada tool
  construida con su propio id ve solo su carrito.

## Do / Don't
- DO: delegar el calculo de subtotales/total a `summarizeCart`
  (`cart_summary.ts`) -- esta tool solo hace el fetch y pasa el resultado.
- DON'T: llamar `cartDb.saveCart` desde aca -- `view_cart` es de solo lectura.
- DON'T: formatear moneda ARS aca -- el resultado en centavos es
  responsabilidad de capas superiores.

## Tests
(Los tests estan en `src/agent/tools/view_cart.test.ts`, oraculo congelado con
`node:test`, usando `openCartDb(":memory:")` -- sin red.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/view_cart.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/view_cart.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
