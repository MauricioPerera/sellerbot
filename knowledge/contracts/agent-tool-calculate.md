---
type: 'Task Contract'
title: 'Tool: calculate'
description: 'Wrapper AgentTool sobre calculateExpression, expone la aritmetica al modelo con manejo de errores estructurado.'
tags: ['ccdd', 'agent', 'poolside', 'tool-example']
language: typescript

task: agent_tool_calculate
intent: "Exponer calculateExpression como una tool de aritmetica del agente."
target: src/agent/tools/calculate.ts
signature: "function calculateTool(): AgentTool"
test_command: "node --test calculate.test.ts"
budget:
  cyclomatic_max: 4
  nesting_max: 2
tests: "src/agent/tools/calculate.test.ts"
tests_sha256: "cd45a91f128481bf23b2a38faef7bc47cff31eba9ff141a61a7c9ebc5034ba0c"
touch_only: ['src/agent/tools/calculate.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Tool: calculate

## Intent
Puente entre [calculate-expression](./agent-calculate-expression.md) (la
logica pura) y el shape `AgentTool` que
[tool-registry](./agent-tool-registry.md) indexa. A diferencia de
[execute-tool-call](./agent-execute-tool-call.md) (que no cubre tools que
lanzan), esta tool SI atrapa sus propios errores — por diseno, siguiendo
el DON'T documentado en ese contrato: "cualquier tool real debe manejar
sus propios errores".

## Interface
```typescript
function calculateTool(): AgentTool {
  return {
    name: "calculate",
    description: string,
    parameters: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
      additionalProperties: false,
    },
    execute: async (args) => ({ result: number }) | ({ error: string }),
  };
}
```

## Invariants
- `name` es siempre `"calculate"`.
- `parameters` exige `expression: string` (`required: ["expression"]`).
- `execute()` nunca lanza: exito -> `{ result: number }`; fallo (parse
  error o `expression` no-string) -> `{ error: string }`.
- Cada llamada a `calculateTool()` devuelve un objeto nuevo (factory, no
  singleton), mismo patron que [get_time](./agent-tool-get-time.md).

## Examples
- `calculateTool().execute({ expression: "2 + 3 * 4" })` -> `{ result: 14 }`.
- `calculateTool().execute({ expression: "1 / 0" })` -> `{ error: "division by zero" }`.
- `calculateTool().execute({ expression: 5 })` -> `{ error: "expression must be a string" }`.

## Do / Don't
- DO: capturar cualquier `Error` de `calculateExpression` en `try/catch` y
  devolver `{ error: err.message }`.
- DON'T: dejar que un error de parseo se propague sin capturar — el
  modelo necesita un mensaje de tool-result, no una excepcion no
  manejada tirando abajo [agent-loop](./agent-agent-loop.md).

## Tests
(Los tests estan en `src/agent/tools/calculate.test.ts`, oraculo
congelado con `node:test`: shape, un caso de exito, un caso de error de
parseo, un caso de input invalido.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/tools/calculate.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tools/calculate.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
