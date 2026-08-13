---
type: 'Task Contract'
title: 'Tool de ejemplo: get_time'
description: 'Tool minima que expone la hora UTC actual en ISO 8601, para probar el wiring end-to-end del agente.'
tags: ['ccdd', 'agent', 'poolside', 'tool-example']
language: typescript

task: agent_tool_get_time
intent: "Exponer una tool get_time que devuelve la hora UTC actual en ISO 8601."
target: src/agent/tools/get_time.ts
signature: "function getTimeTool(): AgentTool"
test_command: "node --test src/agent/tools/get_time.test.ts"
budget:
  cyclomatic_max: 2
  nesting_max: 1
tests: "src/agent/tools/get_time.test.ts"
tests_sha256: "69748693794de41f7c93e11300ec4b7163803ee33300d9696f180f9a351bb82f"
touch_only: ['src/agent/tools/get_time.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool de ejemplo (get_time)

## Intent
Tool minima de ejemplo para verificar de punta a punta que un `AgentTool`
([tool-registry](./agent-tool-registry.md)) se anuncia correctamente al
modelo y que su `execute()` corre y devuelve el shape esperado. No usa
reloj inyectado a proposito: es deliberadamente la unica pieza del agente
cuyo oraculo verifica un patron (`ISO_8601` regex) en vez de igualdad
exacta, porque su unica fuente de variabilidad es `Date.now()`, no I/O
externo — sigue sin tocar red ni disco.

## Interface
```typescript
function getTimeTool(): AgentTool {
  return {
    name: "get_time",
    description: string,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => ({ iso: string }),
  };
}
```

## Invariants
- `name` es siempre `"get_time"`.
- `parameters` no declara ningun input (objeto vacio, `additionalProperties: false`).
- `execute()` siempre devuelve `{ iso }` donde `iso` matchea
  `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/` y es re-parseable con
  `new Date(iso).toISOString() === iso`.

## Examples
- `getTimeTool().name` -> `"get_time"`.
- `await getTimeTool().execute({})` -> `{ iso: "2026-08-12T22:10:00.123Z" }`
  (valor real, pero siempre con ese shape/formato).
- `getTimeTool() !== getTimeTool()` -> cada llamada devuelve un objeto
  nuevo (factory, no singleton).

## Do / Don't
- DO: usar `new Date().toISOString()` directo (nucleo de JS, sin
  dependencias).
- DON'T: aceptar ningun argumento de entrada — `parameters` declara objeto
  vacio a proposito.

## Tests
(Los tests estan en `src/agent/tools/get_time.test.ts`, oraculo congelado
con `node:test`, verificando shape + patron de formato, no un valor fijo.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/get_time.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/get_time.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
